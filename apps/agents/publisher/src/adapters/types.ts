export interface PlatformAdapter {
  upload(videoFilePath: string, metadata: any): Promise<{ success: boolean; platformUrl?: string; error?: string }>;
}
