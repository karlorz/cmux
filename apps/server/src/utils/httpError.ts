export async function getResponseErrorMessage(response: Response): Promise<string> {
  const errorText = (await response.text().catch(() => "")).trim();
  if (errorText.length > 0) {
    try {
      const errorBody: unknown = JSON.parse(errorText);
      if (typeof errorBody === "object" && errorBody !== null) {
        if ("message" in errorBody && typeof errorBody.message === "string" && errorBody.message.length > 0) {
          return errorBody.message;
        }
        if ("error" in errorBody && typeof errorBody.error === "string" && errorBody.error.length > 0) {
          return errorBody.error;
        }
      }
      if (typeof errorBody === "string" && errorBody.length > 0) {
        return errorBody;
      }
    } catch {
      return errorText;
    }
  }
  return response.statusText || "Unknown error";
}
