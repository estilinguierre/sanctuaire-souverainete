export function formatSWError(err: unknown): string {
  if (err instanceof Error) {
    // winax COM errors have an 'errorCode' property
    const comErr = err as Error & { errorCode?: number; description?: string };
    if (comErr.errorCode) {
      return `SolidWorks COM error 0x${comErr.errorCode.toString(16)}: ${
        comErr.description || err.message
      }`;
    }
    return err.message;
  }
  return String(err);
}
