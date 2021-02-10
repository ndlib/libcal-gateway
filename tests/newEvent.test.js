const nock = require('nock')
const helper = require('./_testHelpers')
const newEvent = require('../src/newEvent')

const eventId = '1222'
const libcalData = {
  events: [
    {
      id: eventId,
      title: 'A long title, with lots of "#weird" punctuation* and such.!?',
      start: '2021-02-11T11:00:00-05:00',
      end: '2021-02-11T12:00:00-05:00',
      description: '<p>The Founding Fathers laid out an ambitious plan: count every person in the United States to determine proportional representation in Congress. The U.S. Census has since evolved to expand its scope, collecting data to uncover community needs, subsequently influencing how these needs can best be met.</p>\r\n\r\n<p>Join us in exploring the U.S. Census&rsquo; beginnings, its current charge and intent, and the challenges it faces in contemporary society. We will also spend time experimenting with tools useful for socio-demographic research involving US Census resources&mdash;specifically, extracting and customizing data from Data.Census.gov and visualizing data with Social Explorer.</p>',
      url: {
        public: `https://libcal.library.nd.edu/event/${eventId}`,
      },
      audience: [
        {
          id: 154, // id match
          name: 'Gradz', // won't be checked because of id match
        },
        {
          id: 77777, // id mismatch
          name: 'Undergraduate Students', // name match
        },
        {
          name: 'Postdocs', // name match
        },
        {
          name: 'I AM A PERSON', // name mismatch
        },
      ],
      presenter: 'Bob Newheart, Dennie Moore, Billy Bo Bob Brain',
      registration: true,
    }
  ],
}

describe('newEvent', () => {
  const eventHeaders = {
    Authorization: process.env.CONTENTFUL_CMA_TOKEN,
    'X-Contentful-Topic': 'ContentManagement.Entry.auto_save',
  }
  const eventBody = {
    sys: {
      id: 'test',
    },
    fields: {
      libCalId: {
        'en-US': eventId,
      },
      audience: [],
    },
  }

  let libcalNock
  let contentfulNock

  beforeEach(() => {
    helper.mockTokenFetch()
    console.log = jest.fn()

    libcalNock = nock(process.env.LIBCAL_API_URL)
      .get(`/events/${eventId}`)
      .query(true)
      .reply(200, JSON.stringify(libcalData))

    contentfulNock = nock(process.env.CONTENTFUL_CMA_URL)
      .put(() => true)
      .query(true)
      .reply(200, (url, body) => body)
  })

  it('should call LibCal and Contentful APIs', async () => {
    const callback = (ignore, response) => {
      expect(response.statusCode).toEqual(200)
      expect(libcalNock.isDone()).toBe(true)
      expect(contentfulNock.isDone()).toBe(true)
    }

    await newEvent.handler(helper.getEvent(null, null, eventBody, null, eventHeaders), null, callback)
  })

  it('should handle all known audience ids', async () => {
    nock.cleanAll()
    helper.mockTokenFetch()

    const testLibcalData = {
      events: [
        {
          ...libcalData.events[0],
          audience: [
            { id: 154 },
            { id: 155 },
            { id: 156 },
            { id: 157 },
            { id: 158 },
            { id: 266 },
          ],
        }
      ]
    }
    libcalNock = nock(process.env.LIBCAL_API_URL)
      .get(`/events/${eventId}`)
      .query(true)
      .reply(200, JSON.stringify(testLibcalData))

    contentfulNock = nock(process.env.CONTENTFUL_CMA_URL)
      .put(() => true)
      .query(true)
      .reply(200, (url, body) => body)

    const callback = (ignore, response) => {
      expect(response.statusCode).toEqual(200)
      expect(libcalNock.isDone()).toBe(true)
      expect(contentfulNock.isDone()).toBe(true)

      expect(JSON.parse(response.body).fields.audience['en-US']).toEqual([
        'Graduate Students',
        'Undergraduates',
        'Faculty',
        'Staff',
        'Public, Alumni, & Friends',
        'Postdocs',
      ])
    }

    await newEvent.handler(helper.getEvent(null, null, eventBody, null, eventHeaders), null, callback)
  })

  describe('invalid requests', () => {
    it('should return unauthorized if Authorization header mismatch', async () => {
      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(401)
      }

      const testHeaders = {
        ...eventHeaders,
        Authorization: 'invalid Value',
      }
      await newEvent.handler(helper.getEvent(null, null, eventBody, null, testHeaders), null, callback)
    })

    it('should return 422 if badly formed X-Contentful-Topic header', async () => {
      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(422)
      }

      const testHeaders = {
        ...eventHeaders,
        'X-Contentful-Topic': 'invalid Value',
      }
      await newEvent.handler(helper.getEvent(null, null, eventBody, null, testHeaders), null, callback)
    })

    it('should return not modified if X-Contentful-Topic is not a save event', async () => {
      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(304)
      }

      const testHeaders = {
        ...eventHeaders,
        'X-Contentful-Topic': 'ContentManagement.Entry.published',
      }
      await newEvent.handler(helper.getEvent(null, null, eventBody, null, testHeaders), null, callback)
    })

    it('should return not modified if no libcalid present', async () => {
      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(304)
      }

      const testEvent = {
        ...eventBody,
        fields: {
          ...eventBody.fields,
          libCalId: {
            'en-US': null,
          },
        },
      }
      await newEvent.handler(helper.getEvent(null, null, testEvent, null, eventHeaders), null, callback)
    })

    it('should return not modified if input item already contains data synced from libcal', async () => {
      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(304)
        expect(libcalNock.isDone()).toBe(false)
        expect(contentfulNock.isDone()).toBe(false)
      }

      const testEvent = {
        ...eventBody,
        fields: {
          ...eventBody.fields,
          slug: {
            'en-US': 'already-populated',
          },
        },
      }
      await newEvent.handler(helper.getEvent(null, null, testEvent, null, eventHeaders), null, callback)
    })

    it('should return 404 not found if item does not exist in libcal', async () => {
      nock.cleanAll()
      helper.mockTokenFetch()
      console.error = jest.fn()

      libcalNock = nock(process.env.LIBCAL_API_URL)
        .get(`/events/${eventId}`)
        .query(true)
        .reply(200, JSON.stringify({
          error: 'Error.'
        }))

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(404)
        expect(libcalNock.isDone()).toBe(true)
      }

      await newEvent.handler(helper.getEvent(null, null, eventBody, null, eventHeaders), null, callback)
    })

    it('should return not modified if field values unchanged', async () => {
      nock.cleanAll()
      helper.mockTokenFetch()
      console.error = jest.fn()

      libcalNock = nock(process.env.LIBCAL_API_URL)
        .get(`/events/${eventId}`)
        .query(true)
        .reply(200, JSON.stringify({
          events: [
            {
              id: eventId,
            },
          ],
        }))

      contentfulNock = nock(process.env.CONTENTFUL_CMA_URL)
        .put(() => true)
        .query(true)
        .reply(200, (url, body) => body)

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(304)
      }

      await newEvent.handler(helper.getEvent(null, null, eventBody, null, eventHeaders), null, callback)
    })

    it('should return 500 error if updating Contentful fails', async () => {
      nock.cleanAll()
      helper.mockTokenFetch()
      console.error = jest.fn()

      libcalNock = nock(process.env.LIBCAL_API_URL)
        .get(`/events/${eventId}`)
        .query(true)
        .reply(200, JSON.stringify(libcalData))

      contentfulNock = nock(process.env.CONTENTFUL_CMA_URL)
        .put(() => true)
        .query(true)
        .reply(200, JSON.stringify({
          sys: {
            type: 'Error',
          },
          details: {
            errors: [
              {
                details: 'sample error',
              },
            ],
          },
        }))

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(500)
      }

      await newEvent.handler(helper.getEvent(null, null, eventBody, null, eventHeaders), null, callback)
    })
  })
})