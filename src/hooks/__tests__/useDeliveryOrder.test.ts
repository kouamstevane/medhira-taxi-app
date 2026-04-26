import { validatePin } from '../useDeliveryOrder'

describe('validatePin', () => {
  it('retourne true si le pin correspond', () => {
    expect(validatePin('1234', '1234')).toBe(true)
  })
  it('retourne false si le pin ne correspond pas', () => {
    expect(validatePin('1234', '9999')).toBe(false)
  })
  it('est sensible aux espaces', () => {
    expect(validatePin('1234', ' 1234')).toBe(false)
  })
})
