export const DefaultArtifactClient = jest.fn().mockImplementation(() => ({
  uploadArtifact: jest.fn().mockResolvedValue({ id: 1 }),
  downloadArtifact: jest.fn(),
  listArtifacts: jest.fn(),
  getArtifact: jest.fn(),
  deleteArtifact: jest.fn(),
}));
