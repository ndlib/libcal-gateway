const { getTimeString } = require('../../src/shared/helpers')

describe('helpers', () => {
  describe('getTimeString', () => {
    it('parses an array of known time examples', () => {
      [
        { test: '12am', result: 'T00:00:00' },
        { test: '12pm', result: 'T12:00:00' },
        { test: '9am', result: 'T09:00:00' },
        { test: '10am', result: 'T10:00:00' },
        { test: '01am', result: 'T01:00:00' },
        { test: '01pm', result: 'T13:00:00' },
        { test: '1pm', result: 'T13:00:00' },
        { test: '9pm', result: 'T21:00:00' },
        { test: '0am', result: 'T00:00:00' },
        { test: '0:30am', result: 'T00:30:00' },
        { test: '05:04am', result: 'T05:04:00' },
        { test: '12:04am', result: 'T00:04:00' },
        { test: '12:04pm', result: 'T12:04:00' },
        { test: '05:04pm', result: 'T17:04:00' },
        { test: '05:04:45pm', result: 'T17:04:45' },
        { test: '05:04:05pm', result: 'T17:04:05' },
      ].map((row) => {
        expect(getTimeString(row.test)).toEqual(row.result)
      })
    })
  })
})
