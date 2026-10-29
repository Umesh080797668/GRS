export interface ReleaseManifest {
  version: string;
  buildNumber?: number;
  minSupportedVersion: string;
  apkUrl: string;
  sha256: string;
  checksum?: string;
  fileSize?: number;
  releaseNotes?: string | null;
  releasedAt: Date | string;
  mandatory?: boolean;
}
