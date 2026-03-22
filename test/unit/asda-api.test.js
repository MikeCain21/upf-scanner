const { fetchAsdaProduct, ASDA_PRODUCT_API_URL } = require('../../background/asda-api');

describe('fetchAsdaProduct', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.clearAllMocks(); });

  it('returns product data on success', async () => {
    const mockData = { id: '9167536', upc: '01234567890', c_BRANDBANK_JSON: null };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockData] }),
    });
    const result = await fetchAsdaProduct('9167536', 'Bearer mock-token');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('9167536'),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer mock-token' }),
      })
    );
  });

  it('returns null when no token provided', async () => {
    const result = await fetchAsdaProduct('9167536', null);
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchAsdaProduct('9167536', 'Bearer mock-token');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchAsdaProduct('9167536', 'Bearer mock-token');
    expect(result).toBeNull();
  });

  it('returns null when response data array is empty', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    const result = await fetchAsdaProduct('9167536', 'Bearer mock-token');
    expect(result).toBeNull();
  });
});
