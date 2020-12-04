const nock = require('nock')
const helper = require('./_testHelpers')
const cancelBooking = require('../src/cancelBooking')

const bookingId = 'cs_111'
const bookingsResponse = [
  {
    bookId: bookingId,
    email: helper.defaultEmail,
  },
  {
    bookId: 'ignore',
    foo: 'bar',
    email: helper.defaultEmail,
  },
]
const pathParams = {
  id: bookingId,
}

describe('cancelBooking', () => {
  beforeEach(() => {
    helper.mockTokenFetch()
  })

  it('should check that booking belongs to user before sending cancel request', async () => {
    const getBookingNock = nock(process.env.LIBCAL_API_URL)
      .get(`/space/booking/${bookingId}`)
      .query(true)
      .reply(200, bookingsResponse)

    const cancelBookingNock = nock(process.env.LIBCAL_API_URL)
      .post(`/space/cancel/${bookingId}`)
      .reply(200, null)

    const callback = (ignore, response) => {
      expect(getBookingNock.isDone()).toBe(true)
      expect(cancelBookingNock.isDone()).toBe(true)
      expect(response.statusCode).toEqual(200)
    }

    await cancelBooking.handler(helper.getEvent(pathParams), null, callback)
  })

  it('should throw unauthorized if no email provided in the event authorizer', async () => {
    const callback = (ignore, response) => {
      expect(response.statusCode).toEqual(401)
    }

    await cancelBooking.handler(helper.getEvent(pathParams, null, null, null), null, callback)
  })

  it('should throw bad request if no booking id in the path parameters', async () => {
    const callback = (ignore, response) => {
      expect(response.statusCode).toEqual(400)
    }

    await cancelBooking.handler(helper.getEvent(null), null, callback)
  })

  it('should throw forbidden if booking specified does not belong the current user\'s email address', async () => {
    const getBookingNock = nock(process.env.LIBCAL_API_URL)
      .get(`/space/booking/${bookingId}`)
      .query(true)
      .reply(200, [
        {
          bookId: bookingId,
          email: 'bogus@not.real',
        },
      ])

    const callback = (ignore, response) => {
      expect(getBookingNock.isDone()).toBe(true)
      expect(response.statusCode).toEqual(403)
    }

    await cancelBooking.handler(helper.getEvent(pathParams), null, callback)
  })
})