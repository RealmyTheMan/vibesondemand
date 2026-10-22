import OpenAI from "openai";

const prompt = await Bun.file("./prompt.txt").text();

export async function requestHandler(request: Request): Promise<Response> {
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + Bun.env.DEEPSEEK_KEY,
    },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: await requestToRawHttp(request) },
      ],
      thinking: { type: "disabled" },
      stream: false,
    }),
  });
  const json = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };

  const response = rawHttpToResponse(json.choices[0]!.message.content);

  return response;
}

export async function requestToRawHttp(request: Request): Promise<string> {
  const cloned = request.clone();
  const url = new URL(cloned.url);
  const path = (url.pathname || "/") + url.search;

  const headers = cloned.headers;

  if (!headers.has("host")) headers.set("host", url.host);

  const bodyText = cloned.body ? await cloned.text() : "";
  const bodyByteLength = new TextEncoder().encode(bodyText).byteLength;

  if (
    bodyByteLength > 0 &&
    !headers.has("content-length") &&
    !headers.has("transfer-encoding")
  ) {
    headers.set("content-length", bodyByteLength.toString());
  }

  const requestLine = `${cloned.method.toUpperCase()} ${path} HTTP/1.1`;
  const headerLines: string[] = [];

  headers.forEach((value, key) => {
    headerLines.push(`${key}: ${value}`);
  });

  const head = [requestLine, ...headerLines].join("\r\n");
  return `${head}\r\n\r\n${bodyText}`;
}

export function rawHttpToResponse(rawHttp: string): Response {
  const crlfSplit = rawHttp.indexOf("\r\n\r\n");
  const lfSplit = rawHttp.indexOf("\n\n");

  let headPart: string;
  let bodyPart: string;
  let lineDelimiter: string;

  if (crlfSplit !== -1 && (lfSplit === -1 || crlfSplit < lfSplit)) {
    headPart = rawHttp.slice(0, crlfSplit);
    bodyPart = rawHttp.slice(crlfSplit + 4);
    lineDelimiter = "\r\n";
  } else if (lfSplit !== -1) {
    headPart = rawHttp.slice(0, lfSplit);
    bodyPart = rawHttp.slice(lfSplit + 2);
    lineDelimiter = "\n";
  } else {
    headPart = rawHttp;
    bodyPart = "";
    lineDelimiter = rawHttp.includes("\r\n") ? "\r\n" : "\n";
  }

  const lines = headPart.split(lineDelimiter);
  const statusLine = lines.shift()?.trim() ?? "";

  const statusMatch = statusLine.match(
    /^HTTP\/\d+(?:\.\d+)?\s+(\d{3})(?:\s+(.*))?$/i,
  );
  if (!statusMatch)
    throw new Error(`Invalid HTTP status line: "${statusLine}"`);

  const status = parseInt(statusMatch[1]!, 10);
  const statusText = statusMatch[2] ?? "";

  const headers = new Headers();
  for (const line of lines) {
    if (!line.trim()) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Malformed HTTP header line: "${line}"`);
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    headers.append(key, value);
  }

  const isNullBodyStatus =
    status === 101 || status === 204 || status === 205 || status === 304;

  return new Response(isNullBodyStatus ? null : bodyPart, {
    status,
    statusText,
    headers,
  });
}
