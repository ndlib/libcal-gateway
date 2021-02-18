const fetch = require('node-fetch')
const { t: typy } = require('typy')
const { getToken, requestHeaders, stripHtml } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

// Used to detect changes between CF and libcal
const allLibCalFields = [
  'title',
  'slug',
  'startDate',
  'endDate',
  'content',
  'shortDescription',
  'presenter',
  'registrationRequired',
  'registrationUrl',
  'audience',
]

// Used to map values from one key to the other
const libCalMapping = {
  id: 'libCalId',
  title: 'title',
  // title: 'slug', // need to remove special characters and change whitespace to _
  start: 'startDate',
  end: 'endDate',
  // description: 'content', // need to clean out html
  // description: 'shortDescription', // copying description content exactly
  presenter: 'presenter',
  registration: 'registrationRequired',
  'url.public': 'registrationUrl',
  // audience: 'audience', // Needs to be handled specially since it's an array of objects in libcal
}

// Valid audience options
const contentfulAudiences = [
  'Undergraduates',
  'Graduate Students',
  'Faculty',
  'Staff',
  'Postdocs',
  'Public, Alumni, & Friends',
]

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const notModified = () => {
    return errorResponse(callback, 'Not Modified', 304)
  }

  // This is called from a Contentful hook. To prevent anonymous access, the webhook should be configured
  // with the Contentful CMA token in the Authorization header. Verify the header is present and matches here.
  if (typy(event, 'headers.Authorization').safeString !== process.env.CONTENTFUL_CMA_TOKEN) {
    return errorResponse(callback, 'Unauthorized', 401)
  }

  // Check that we have a valid event from Contentful
  const cfTopic = typy(event, 'headers.X-Contentful-Topic').safeString
  const topicRegex = /^ContentManagement\..*\.(.*)/
  if (!cfTopic || !topicRegex.test(cfTopic)) {
    return errorResponse(callback, 'Unrecognized event.', 422)
  }

  const topicSuffix = cfTopic.match(topicRegex)[1]
  if (!['auto_save', 'save'].includes(topicSuffix)) {
    return notModified()
  }

  // Get the updated Contentful entry details from the save event
  const entry = JSON.parse(typy(event, 'body').safeString)
  const fields = typy(entry, 'fields').safeObjectOrEmpty
  const entryId = typy(entry, 'sys.id').safeString
  const libCalId = typy(fields, 'libCalId.en-US').safeString

  console.log(`Running on entry ${entryId} with libcal id ${libCalId}.`)

  if (!libCalId) {
    console.log(callback, 'No libCalId present.')
    return notModified()
  }

  const matchingFieldExists = allLibCalFields.some(field => fields[field] && fields[field]['en-US'])
  if (matchingFieldExists) {
    console.log('Not updating entry because one or more fields already exist.')
    return notModified()
  }

  const libCalEvent = await getLibCalEvent(libCalId)
  if (!libCalEvent) {
    return errorResponse(callback, 'LibCal event not found.', 404)
  }

  const processedEvent = handleEvent(libCalEvent)
  const result = await updateContentful(entry, processedEvent)
  if (!result) {
    return errorResponse(callback, 'Error updating contentful.', 500)
  } else if (result === 304) {
    return notModified()
  }

  return successResponse(callback, result)
})

const getLibCalEvent = async (eventId) => {
  const libcalToken = await getToken()

  const url = `${process.env.LIBCAL_API_URL}/events/${eventId}`
  console.log(`Getting libcal event: ${url}`)

  const responseObj = await fetch(url, { headers: requestHeaders(libcalToken) }).then(res => res.json())
  if (responseObj.error) {
    console.error(responseObj)
    return null
  }

  // Only valid if there is exactly one event.
  const events = typy(responseObj, 'events').safeArray
  return events.length === 1 ? events[0] : null
}

const handleEvent = (e) => {
  const event = {}

  // Get a nested value from an object with a path like "object.path.id"
  const getVal = (obj, path) => {
    return path.split('.').reduce((prev, curr) => prev && prev[curr], obj)
  }

  Object.keys(libCalMapping).forEach(key => {
    const fieldValue = getVal(e, key)
    const newKey = libCalMapping[key]
    // Convert numbers to strings
    event[newKey] = typy(fieldValue).isNumber ? fieldValue.toString() : fieldValue
  })
  // remove preceding/trailing whitespace, remove extra html info eg <p id="foo"> => <p>
  const sanitizedDescription = stripHtml(typy(e.description).safeString.trim().replace(/\r/g, ''))
  event.content = sanitizedDescription || undefined

  // We don't want the entire description as the short, just use the first longish paragraph
  // because most entries start with <p><span></span></p>\n\n<p>.... so we want to skip the first section
  const splitContent = sanitizedDescription ? sanitizedDescription.split('\n') : [undefined]
  if (splitContent.length > 0) {
    event.shortDescription = splitContent.find(line => line && line.length >= 50) || splitContent[0]
  }

  let start = typy(e, 'start').safeString
  if (start && start.includes('T')) {
    start = start.split('T')[0]
  }

  // Remove all non-alphanumeric except spaces and hyphens, convert to lowercase, and replace spaces with hyphen
  const cleanSlugRegex = /[^A-Z 0-9-]/gi
  let slug = typy(e, 'title').safeString.toLowerCase().replace(cleanSlugRegex, '').trim().replace(/\s/g, '-')
  if (slug) {
    // strip words off the end of the slug until it's <= 50 characters
    while (slug.length > 50) {
      const lastHyphen = slug.lastIndexOf('-')
      slug = slug.slice(0, lastHyphen > 0 ? lastHyphen : 50)
    }
    event.slug = `${slug}-${start}`
  }

  event.audience = typy(e, 'audience').safeArray.map(aud => {
    // Return values here should match the verbage in Contentful
    switch (aud.id) {
      case 154:
        return 'Graduate Students'
      case 155:
        return 'Undergraduates'
      case 156:
        return 'Faculty'
      case 157:
        return 'Staff'
      case 158:
        return 'Public, Alumni, & Friends'
      case 266:
        return 'Postdocs'
      default:
        // Unexpected id... Try to match on name
        // This one is named differently from what is used in contentful
        if (aud.name === 'Undergraduate Students') {
          return 'Undergraduates'
        } else if (contentfulAudiences.includes(aud.name)) {
          return aud.name
        }

        // Didn't find a valid name or id. Can't do anything with this so the value simply won't get synced
        return null
    }
  }).filter(val => !!val) // filter out nulls

  return event
}

const updateContentful = async (entry, libCalData) => {
  const sys = typy(entry, 'sys').safeObjectOrEmpty
  const updateUrl = `${process.env.CONTENTFUL_CMA_URL}/spaces/${process.env.CONTENTFUL_SPACE}/environments/${process.env.CONTENTFUL_ENV}/entries/${sys.id}`
  const headers = {
    'Content-Type': 'application/vnd.contentful.management.v1+json',
    'X-Contentful-Content-Type': 'event',
    'X-Contentful-Version': sys.version,
    Authorization: `Bearer ${process.env.CONTENTFUL_CMA_TOKEN}`,
  }

  // Use existing item as a base
  const convertedData = {
    fields: entry.fields,
  }
  // Insert libcal values. Check along the way to make sure at least one field changed.
  let modified = false
  Object.keys(libCalData).forEach(key => {
    if (typeof libCalData[key] !== 'undefined' && (
      !convertedData.fields[key] || !convertedData.fields[key]['en-US'] || convertedData.fields[key]['en-US'] !== libCalData[key]
    )) {
      // Arrays are not equal, so we have to compare their contents by converting them to strings
      if (!Array.isArray(convertedData.fields[key]) || JSON.stringify(convertedData.fields[key]) !== JSON.stringify(libCalData[key])) {
        convertedData.fields[key] = {
          'en-US': libCalData[key],
        }
        modified = true
      }
    }
  })
  if (!modified) {
    return 304
  }

  console.log('Calling Contentful Management API:', updateUrl)
  console.log(JSON.stringify(convertedData, null, 2))
  const response = await fetch(updateUrl, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(convertedData),
  }).then(async res => res.ok ? await res.json() : null)

  if (!response || typy(response, 'sys.type').safeString === 'Error') {
    typy(response, 'details.errors').safeArray.forEach(error => {
      console.error(`ERROR: ${error.details}`)
    })
    return null
  }

  console.log('Successfully updated.')
  return response
}
