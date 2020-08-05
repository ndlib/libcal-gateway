const nock = require('nock')
const helper = require('./_testHelpers')
const getSpaceLocations = require('../src/getSpaceLocations')

const mockResponse = [
  {
    id: 1,
    foo: 'bar',
  },
  {
    id: 2,
    baz: 'foobar',
  },
]

describe('getSpaceLocations', () => {
  beforeEach(() => {
    helper.mockTokenFetch()
  })

  it('should call LibCal API', async () => {
    const testNock = nock(process.env.LIBCAL_API_URL)
      .get('/space/locations')
      .query(true)
      .reply(200, mockResponse)

    const callback = (ignore, response) => {
      expect(testNock.isDone()).toBe(true)
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual(JSON.stringify(mockResponse))
    }

    await getSpaceLocations.handler(helper.getEvent(), null, callback)
  })
})