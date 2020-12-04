const nock = require('nock')
const moment = require('moment-timezone')
const helper = require('./_testHelpers')
const hours = require('../src/hours')

const mockLocations = [
  {
    lid: 123,
    name: 'Hesburgh Library',
    category: 'library',
    desc: '',
    url: 'http://library.nd.edu',
    contact: '<p>(111) 275-4343<br />\r\n&nbsp;</p>',
    lat: '',
    long: '',
    color: '#5271AB',
    fn: '',
    weeks: [
      {
        Sunday: {
          date: '2020-11-29',
          times: {
            status: 'open',
            hours: [
              {
                from: '8am',
                to: '12am'
              }
            ],
            currently_open: false
          },
          rendered: '8am - midnight'
        },
        Monday: {
          date: '2020-12-08',
          times: {
            status: '24hours',
            hours: [],
            currently_open: false
          },
          rendered: '8am - 8pm'
        },
        Tuesday: {
          date: '2020-12-08',
          times: {
            status: 'open',
            hours: [
              {
                from: '12am',
                to: '',
              }
            ],
            currently_open: false
          },
          rendered: '12am'
        },
      },
      {
        Sunday: {
          date: '2020-11-29',
          times: {
            status: 'open',
            hours: [
              {
                from: '3am',
                to: '2am',
              },
              {
                from: '8pm',
                to: ''
              }
            ],
            currently_open: false
          },
          rendered: '3am - 2am, 8pm - 12am'
        },
      },
      {
        Tuesday: {
          date: '2020-12-15',
          times: {
            status: 'open',
            hours: [
              {
                from: '7am',
                to: '10pm'
              }
            ],
            currently_open: false
          },
          rendered: '7am - 10pm'
        },
      },
    ]
  },
  {
    lid: 6088,
    name: 'London Global Gateway Library',
    category: 'department',
    desc: '',
    url: 'https://library.nd.edu/london-global-gateway',
    contact: '',
    lat: '',
    long: '',
    color: '#5271AB',
    parent_lid: 6087,
    weeks: [
      {
        Sunday: {
          date: '2020-11-29',
          times: {
            status: 'text',
            text: 'Closed until further notice',
            currently_open: false
          },
          rendered: 'Closed until further notice'
        },
      },
    ],
  }
]

const mockResponse = {
  locations: mockLocations,
}

describe('hours', () => {
  beforeEach(() => {
    helper.mockTokenFetch()
  })

  it('should fetch from hours widget url and return valid response with no data', async () => {
    const testNock = nock(process.env.LIBCAL_HOURS_WIDGET_URL)
      .get(() => true)
      .query(true)
      .reply(200, {})

    const expected = {
      locations: {},
    }

    const callback = (ignore, response) => {
      expect(testNock.isDone()).toBe(true)
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual(JSON.stringify(expected))
    }

    await hours.handler(helper.getEvent(), null, callback)
  })

  it('should add timezone info to locations', async () => {
    const testNock = nock(process.env.LIBCAL_HOURS_WIDGET_URL)
      .get(() => true)
      .query(true)
      .reply(200, mockResponse)

    const callback = (ignore, response) => {
      expect(testNock.isDone()).toBe(true)
      expect(response.statusCode).toEqual(200)

      const locationsResponse = JSON.parse(response.body).locations
      expect(locationsResponse['123'].timezone).toEqual('EST')
      expect(locationsResponse['123'].timezoneOffset).toEqual('-05:00')

      // London timezone for location id 6088
      expect(locationsResponse['6088'].timezone).toEqual('GMT')
      expect(locationsResponse['6088'].timezoneOffset).toEqual('+00:00')
    }

    await hours.handler(helper.getEvent(), null, callback)
  })

  describe('addLocalHours', () => {
    const tz = process.env.LIBCAL_TIMEZONE

    it('parses open example with hours', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '12am', to: '11pm' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '12am', to: '11pm', fromLocalDate: moment.tz('2017-09-08T00:00:00', tz).format(), toLocalDate: moment.tz('2017-09-08T23:00:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses open example with hours ending at 12am', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '1am', to: '12am' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '1am', to: '12am', fromLocalDate: moment.tz('2017-09-08T01:00:00', tz).format(), toLocalDate: moment.tz('2017-09-09T00:00:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses open example with hours ending before the from', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '8am', to: '3am' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '8am', to: '3am', fromLocalDate: moment.tz('2017-09-08T08:00:00', tz).format(), toLocalDate: moment.tz('2017-09-09T03:00:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses open example with hours : minutes', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '2:30am', to: '11:45pm' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '2:30am', to: '11:45pm', fromLocalDate: moment.tz('2017-09-08T02:30:00', tz).format(), toLocalDate: moment.tz('2017-09-08T23:45:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses a midnight record', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '12:30am', to: '11:45pm' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '12:30am', to: '11:45pm', fromLocalDate: moment.tz('2017-09-08T00:30:00', tz).format(), toLocalDate: moment.tz('2017-09-08T23:45:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses a noon record', () => {
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '12:30pm', to: '11:45pm' } ] }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { from: '12:30pm', to: '11:45pm', fromLocalDate: moment.tz('2017-09-08T12:30:00', tz).format(), toLocalDate: moment.tz('2017-09-08T23:45:00', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it('parses a 24hour record', () => {
      const test = { times: { currently_open: false, status: '24hours' }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = { fromLocalDate: moment.tz('2017-09-08T00:00:00', tz).format(), toLocalDate: moment.tz('2017-09-08T23:59:59', tz).format() }

      expect(hours.addLocalHours(tz, test).times.hours[0]).toEqual(result)
    })

    it ('parses a 24 hour record and changes the rendered value', () => {
      const test = { times: { currently_open: false, status: '24hours' }, date: '2017-09-08', rendered: '12am - 11pm' }
      expect(hours.addLocalHours(tz, test).rendered).toEqual('Open 24 Hours')
    })

    it('parses a closed record', () => {
      const test = { times: { currently_open: false, status: 'closed' }, date: '2017-09-08', rendered: '12am - 11pm' }
      const result = test

      expect(hours.addLocalHours(tz, test)).toEqual(test)
    })

    it ('parses a not-set', () => {
      const test = { times: { status: 'not-set' }, date: '2017-09-08', rendered: '' }
      const result = test

      expect(hours.addLocalHours(tz, test)).toEqual(test)
    })

    it ('parses hours when the from time is 12am and the prev day is 24hours', () => {
      // this is an example of what libcal produces when there is no from time set in the ui
      // from is 12am and the rendered looks like ' ' + toTime
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '12am', to: '11:45pm' } ] }, date: '2017-09-08', rendered: '12am to 11:45pm' }

      expect(hours.addLocalHours(tz, test, undefined, '24hours').rendered).toEqual('Closes at 11:45pm')
    })

    it ('updates the rendered text when the to time is 12am and next day is 24hours', () => {
      // this is an example of what libcal produces when there is no from time set in the ui
      // to is empty and the rendered looks like ' ' + toTime
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '8am', to: '12am' } ] }, date: '2017-09-08', rendered: '8am ' }
      expect(hours.addLocalHours(tz, test, '24hours').rendered).toEqual('Opens at 8am')
    })

    it ('updates the to date when the to is unset', () => {
      // this is an example of what libcal produces when there is no from time set in the ui
      // to is empty and the rendered looks like ' ' + toTime
      const test = { times: { currently_open: false, status: 'open', hours: [ { from: '8am', to: '' } ] }, date: '2017-09-08', rendered: '8am ' }
      expect(hours.addLocalHours(tz, test).times.hours[0].toLocalDate).toEqual('2017-09-08T23:59:59-04:00')
    })
  })
})