const SUPPORTED_MARKETS = ['CM', 'CA', 'FR', 'BE'] as const;

type MarketCode = typeof SUPPORTED_MARKETS[number];

const MARKET_COUNTRY_BY_CODE: Record<MarketCode, string> = {
  CM: 'CM',
  CA: 'CA',
  FR: 'FR',
  BE: 'BE',
};

export function getActiveMarketCode(): MarketCode {
  const value = process.env.ACTIVE_MARKET?.toUpperCase();
  if (SUPPORTED_MARKETS.includes(value as MarketCode)) {
    return value as MarketCode;
  }
  return 'CA';
}

export function getActiveMarketCountryCode(): string {
  return MARKET_COUNTRY_BY_CODE[getActiveMarketCode()];
}
