const nock = require('nock')
const helper = require('../_testHelpers')
const { sentryWrapper } = require('../../src/shared/sentryWrapper')

describe('sentryWrapper', () => {
  beforeEach(() => {
    console.error = jest.fn()
  })

  it('should catch uncaught errors and return an error response', async () => {
    const handler = async () => {
      throw Error('Test')
    }

    const callback = (ignore, response) => {
      expect(response.statusCode).toBeGreaterThan(399)
      expect(console.error).toHaveBeenCalled()
    }

    await sentryWrapper(handler)(null, null, callback)
  })
})