const nock = require('nock')
const helper = require('./_testHelpers')
const { dateToYMD } = require('../src/shared/helpers')
const getSpaceBookings = require('../src/getSpaceBookings')

describe('getSpaceBookings', () => {
  beforeEach(() => {
    helper.mockTokenFetch()
  })

  it('should throw unauthorized if no email provided in the event authorizer', async () => {
    const callback = (ignore, response) => {
      expect(response.statusCode).toEqual(401)
    }

    await getSpaceBookings.handler(helper.getEvent(null, null, null, null), null, callback)
  })

  describe('with no dates specified', () => {
    it('should fetch bookings for the current day', async () => {
      const booking = {
        eid: 12345,
        foo: 'bar',
      }
      const space = {
        id: 12345,
        name: 'test me',
      }

      const bookingsNock = nock(process.env.LIBCAL_API_URL)
        .get('/space/bookings')
        .query(query => query.date === dateToYMD(new Date()))
        .reply(200, [booking])

      const itemNock = nock(process.env.LIBCAL_API_URL)
        .get(`/space/item/${booking.eid}`)
        .query(true)
        .reply(200, [space])

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(200)
        expect(response.body).toEqual(JSON.stringify([
          {
            ...booking,
            space_name: space.name,
          }
        ]))
      }

      await getSpaceBookings.handler(helper.getEvent(), null, callback)
    })

    it('should throw an error if libcal API returns an error status code', async () => {
      const bookingsNock = nock(process.env.LIBCAL_API_URL)
        .get('/space/bookings')
        .query(query => query.date === dateToYMD(new Date()))
        .reply(404, null)

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(404)
      }

      await getSpaceBookings.handler(helper.getEvent(), null, callback)
    })
  })

  describe('with dates', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let bookingsNock
    let itemNock

    beforeEach(() => {
      const booking = {
        eid: 12345,
        foo: 'bar',
      }
      const space = {
        id: 12345,
        name: 'test me',
      }

      bookingsNock = nock(process.env.LIBCAL_API_URL)
        .get('/space/bookings')
        .query(true)
        .optionally()
        .reply(200, [booking])
        .persist()

      itemNock = nock(process.env.LIBCAL_API_URL)
        .get(/\/space\/item\/(?:\d*,?)+/) // Looks like: /space/item/1234,555,234
        .query(true)
        .optionally()
        .reply(200, [space])
        .persist()
    })

    afterEach(() => {
      nock.cleanAll()
    })

    afterAll(() => {
      nock.restore()
    })

    it('should fetch bookings for each date in the range', async () => {
      const start = today
      const end = new Date()
      end.setDate(today.getDate() + 2) // 2 days from today

      const queryParams = {
        startDate: start,
        endDate: end,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(200)
        expect(bookingsNock.interceptors[0].interceptionCounter).toEqual(3)
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })

    it('should ignore dates prior to today', async () => {
      const start = new Date()
      start.setDate(today.getDate() - 10)
      const end = new Date()
      end.setDate(today.getDate() + 2) // 2 days from today

      const queryParams = {
        startDate: start,
        endDate: end,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(200)
        expect(bookingsNock.interceptors[0].interceptionCounter).toEqual(3) // today + next 2 days
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })

    it('should only get one day if no end date specified', async () => {
      const start = new Date()
      start.setDate(today.getDate() + 4)

      const queryParams = {
        startDate: start,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(200)
        expect(bookingsNock.interceptors[0].interceptionCounter).toEqual(1)
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })

    it('should throw bad request if end date is less than start date', async () => {
      const start = new Date()
      start.setDate(today.getDate() + 3)
      const end = today

      const queryParams = {
        startDate: start,
        endDate: end,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(400)
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })

    it('should throw bad request if date range is larger than 31 days', async () => {
      const start = today
      const end = new Date()
      end.setDate(today.getDate() + 31) // Today + 31 is a total of 32 days

      const queryParams = {
        startDate: start,
        endDate: end,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(400)
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })

    it('should succeed if date range is exactly 31 days (edge case)', async () => {
      const start = today
      const end = new Date()
      end.setDate(today.getDate() + 30)

      const queryParams = {
        startDate: start,
        endDate: end,
      }

      const callback = (ignore, response) => {
        expect(response.statusCode).toEqual(200)
        expect(bookingsNock.isDone()).toBe(true)
      }

      await getSpaceBookings.handler(helper.getEvent(null, queryParams), null, callback)
    })
  })
})