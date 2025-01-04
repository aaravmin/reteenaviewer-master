import type { NextApiResponse, NextApiRequest } from 'next';
 
export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
    let url = request.body.location;
    //TODO check to make sure this isnt sploofed by client to a different domain.

    //Do the model here, ie pinging python server.
    console.log("run transform on " + url);
    response.json({
        url: url
    });
}