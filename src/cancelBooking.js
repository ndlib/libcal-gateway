const fetch = require('node-fetch')
const { t: typy } = require('typy')
const { getToken, requestHeaders } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const email = typy(event, 'requestContext.authorizer.email').safeString
  if (!email) {
    return errorResponse(callback, null, 401)
  }

  const token = await getToken()

  // First we need to get the user's reserved bookings. We need to validate that the user initiating this request
  // is authorized to cancel the booking id specified.
  const bookingsUrl = `${process.env.LIBCAL_API_URL}/space/bookings?email=${encodeURIComponent(email)}&limit=100`
  const bookingsResponse = await fetch(bookingsUrl, { headers: requestHeaders(token) }).then(async res => ({
    statusCode: res.status,
    data: res.ok ? await res.json() : null,
  }))

  // Check that the response contains a matching booking id, and if not, throw an error.
  const bookingId = typy(event, 'pathParameters.id').safeString
  if (!bookingId) {
    return errorResponse(callback, 'Booking id path parameter is required.', 400)
  }
  // Contrary to their documentation, the property is called "bookId" instead of "booking_id"
  if (!typy(bookingsResponse).safeArray.some(booking => booking.bookId === bookingId)) {
    return errorResponse(callback, null, 403)
  }

  // At this point we've validated they are authorized. Send the cancel request
  const cancelUrl = `${process.env.LIBCAL_API_URL}/space/bookings/${encodeURIComponent(bookingId)}`
  const cancelResponse = await fetch(cancelUrl, {
    method: 'POST',
    headers: requestHeaders(token),
  }).then(async res => ({
    statusCode: res.status,
    data: res.ok ? await res.json() : null,
  }))

  return successResponse(callback, cancelResponse.data, cancelResponse.statusCode)
})
