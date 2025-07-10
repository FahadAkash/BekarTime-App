import { HTTP_API_URL } from "./constants";

export async function makeRequest(method: string, path: string, data: any = null) {
  const url = HTTP_API_URL + path;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();
    return { statusCode: response.status, data: responseData };
  } catch (error) {
    console.error("Request error:", error);
    throw error;
  }
}