const { fetchAsdaProduct, ASDA_PRODUCT_API_BASE } = require('../../background/asda-api');

describe('fetchAsdaProduct', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.clearAllMocks(); });

  it('returns product data on success', async () => {
    const mockData = { id: '9167536', upc: '028400090018', c_BRANDBANK_JSON: null };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
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

  it('calls the correct ASDA API URL', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchAsdaProduct('9167536', 'tok');
    expect(global.fetch).toHaveBeenCalledWith(
      `${ASDA_PRODUCT_API_BASE}9167536?siteId=ASDA_GROCERIES&allImages=true&c_isPDP=true`,
      expect.any(Object)
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

  it('returns null and does not call fetch when token contains a newline', async () => {
    const result = await fetchAsdaProduct('9167536', 'Bearer mock\ninjected: header');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null and does not call fetch when token contains a carriage return', async () => {
    const result = await fetchAsdaProduct('9167536', 'Bearer mock\rinjected: header');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
