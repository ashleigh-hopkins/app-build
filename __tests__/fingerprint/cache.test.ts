import * as cache from '@actions/cache';
import { restoreFingerprintCache, saveFingerprintCache } from '../../src/fingerprint/cache';

jest.mock('@actions/core');
jest.mock('@actions/cache');

const mockRestoreCache = cache.restoreCache as jest.MockedFunction<typeof cache.restoreCache>;
const mockSaveCache = cache.saveCache as jest.MockedFunction<typeof cache.saveCache>;

describe('fingerprint cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('restoreFingerprintCache', () => {
    it('returns true on cache hit', async () => {
      mockRestoreCache.mockResolvedValue('native-build-ios-abc123');

      const result = await restoreFingerprintCache('ios', 'abc123');

      expect(result).toBe(true);
      expect(mockRestoreCache).toHaveBeenCalledWith(
        expect.any(Array),
        'native-build-ios-abc123',
      );
    });

    it('returns false on cache miss', async () => {
      mockRestoreCache.mockResolvedValue(undefined);

      const result = await restoreFingerprintCache('ios', 'abc123');

      expect(result).toBe(false);
    });

    it('returns false on cache error', async () => {
      mockRestoreCache.mockRejectedValue(new Error('Cache service unavailable'));

      const result = await restoreFingerprintCache('ios', 'abc123');

      expect(result).toBe(false);
    });

    it('uses platform in cache key', async () => {
      mockRestoreCache.mockResolvedValue(undefined);

      await restoreFingerprintCache('android', 'xyz789');

      expect(mockRestoreCache).toHaveBeenCalledWith(
        expect.any(Array),
        'native-build-android-xyz789',
      );
    });
  });

  describe('saveFingerprintCache', () => {
    it('saves cache with correct key', async () => {
      mockSaveCache.mockResolvedValue(12345);

      await saveFingerprintCache('ios', 'abc123');

      expect(mockSaveCache).toHaveBeenCalledWith(
        expect.any(Array),
        'native-build-ios-abc123',
      );
    });

    it('does not throw on cache save error', async () => {
      mockSaveCache.mockRejectedValue(new Error('Key already exists'));

      // Should not throw
      await saveFingerprintCache('ios', 'abc123');
    });
  });
});
