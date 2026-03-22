'use strict';

const { fetchSainsburysBarcodes, SAINSBURYS_GOL_API_BASE } = require('../../background/sainsburys-api');

describe('fetchSainsburysBarcodes', () => {
  beforeEach(() => { global.fetch = jest.fn(); });
  afterEach(() => { jest.clearAllMocks(); });

  it('returns parsed response on success', async () => {
    const mockData = { eans: ['3176575128962', '3176575493930'] };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });
    const result = await fetchSainsburysBarcodes('2852652');
    expect(result).toEqual(mockData);
  });

  it('calls the correct Sainsburys GOL API URL', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchSainsburysBarcodes('2852652');
    expect(global.fetch).toHaveBeenCalledWith(
      `${SAINSBURYS_GOL_API_BASE}2852652`,
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('includes Cookie header when cookieHeader is provided', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchSainsburysBarcodes('2852652', 'session=abc123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { cookie: 'session=abc123' } })
    );
  });

  it('omits Cookie header when cookieHeader is not provided', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchSainsburysBarcodes('2852652');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers).toEqual({});
  });

  it('returns null on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchSainsburysBarcodes('2852652');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchSainsburysBarcodes('2852652');
    expect(result).toBeNull();
  });
});
