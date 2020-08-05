const fetch = require('node-fetch')
const { t: typy } = require('typy')
const { getToken, requestHeaders, dateToYMD } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const email = typy(event, 'requestContext.authorizer.email').safeString
  const params = typy(event, 'queryStringParameters').safeObjectOrEmpty
  if (!email) {
    return errorResponse(callback, null, 401)
  }

  const token = await getToken()

  // LibCal API only allows fetching bookings for a SINGLE date... So we have to make a call for each date we want
  // to get bookings for. Why do people make APIs with such colossal limitations?!
  const startDateStr = params.startDate
  const endDateStr = params.endDate

  let startDate, endDate
  const dates = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (!startDateStr && !endDateStr) {
    // If neither are provided just use today... This is the simplest scenario
    dates.push(dateToYMD(today))
  } else {
    // Default to today, and set a minimum start date of today
    if (startDateStr) {
      startDate = new Date(startDateStr)
      startDate.setHours(0, 0, 0, 0)
    }
    // LibCal API does not allow you to query before the current date so don't bother
    if (!startDate || startDate.getTime() < today.getTime()) {
      startDate = today
    }

    // Maximum date range is 31 days (start date + 30, inclusive)
    // This is an arbitrary limit to prevent bombarding the API with hundreds of requests with a large/invalid range
    const maxDate = new Date(startDate.getTime())
    maxDate.setDate(maxDate.getDate() + 30)
    maxDate.setHours(0, 0, 0, 0)

    if (endDateStr) {
      endDate = new Date(endDateStr)
      endDate.setHours(0, 0, 0, 0)
    }
    // Default end date is start date
    if (!endDate) {
      endDate = startDate
    } else if (endDate.getTime() > maxDate.getTime()) {
      return errorResponse(callback, 'Date range cannot exceed 31 days.', 400)
    } else if (endDate.getTime() < startDate.getTime()) {
      // End date is less than start date... bad request
      return errorResponse(callback, 'End date must be greater than or equal to start date.', 400)
    }

    const currentDate = new Date(startDate)
    while (currentDate.getTime() <= endDate.getTime()) {
      dates.push(dateToYMD(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
  }

  const promises = []
  dates.forEach(async date => {
    const url = `${process.env.LIBCAL_API_URL}/space/bookings?date=${date}&email=${encodeURIComponent(email)}&limit=100`
    const promise = fetch(url, { headers: requestHeaders(token) }).then(async res => ({
      statusCode: res.status,
      data: res.ok ? await res.json() : null,
    }))
    promises.push(promise)
  })

  const results = await Promise.all(promises)
  const output = {
    statusCode: 200,
    data: [],
  }
  results.forEach(result => {
    // If any of the requests fail, this API call wasn't really successful. Return an error.
    if (result.statusCode < 200 || result.statusCode >= 400) {
      return errorResponse(callback, 'LibCal API returned an error.', result.statusCode)
    }
    output.data = output.data.concat(result.data)
  })

  // That's great and all, but we also want to know the name of the space the booking is at.
  // This requires yet another query...
  const spaceIds = output.data.map(booking => booking.eid).join(',')
  const detailsUrl = `${process.env.LIBCAL_API_URL}/space/item/${spaceIds}`
  const detailsResponse = await fetch(detailsUrl, { headers: requestHeaders(token) }).then(async res => ({
    statusCode: res.status,
    data: res.ok ? await res.json() : null,
  }))

  // Now add the name to the output for each booking
  output.data = output.data.map(booking => {
    const matchingSpace = typy(detailsResponse.data).safeArray.find(space => space.id === booking.eid)
    const name = matchingSpace ? matchingSpace.name : null
    return {
      ...booking,
      space_name: name,
    }
  })

  return successResponse(callback, output.data, output.statusCode)
})
