import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { NextApiResponse, NextApiRequest } from 'next';
 
export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  const body = request.body as HandleUploadBody;
 
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (
        pathname,
      ) => {
        return {
          //TODO - for anything other than a demo, there should be some auth here (otherwise any could use this api route to turn the blob store into anonymous storage)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {

      },
    });
 
    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: (error as Error).message });
  }
}