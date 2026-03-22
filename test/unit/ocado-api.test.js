'use strict';

const { fetchOcadoIngredients, OCADO_BOP_API_BASE } = require('../../background/ocado-api');

describe('fetchOcadoIngredients', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.clearAllMocks(); });

  it('returns parsed response on success', async () => {
    const mockData = { bopData: { fields: [{ title: 'ingredients', content: 'Milk, Sugar' }] } };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const result = await fetchOcadoIngredients('12345678');
    expect(result).toEqual(mockData);
  });

  it('calls the correct Ocado BOP API URL', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchOcadoIngredients('12345678');
    expect(global.fetch).toHaveBeenCalledWith(
      `${OCADO_BOP_API_BASE}?retailerProductId=12345678`,
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('does not include a headers property in the fetch options', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchOcadoIngredients('12345678');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers).toBeUndefined();
  });

  it('returns null on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchOcadoIngredients('12345678');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchOcadoIngredients('12345678');
    expect(result).toBeNull();
  });
});
