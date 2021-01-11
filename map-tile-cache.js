/*
* Use this worker to cache requests to different map tile services, on both the client and CF for 1 day.
* For the url 'your.worker-url.com/carto/dark_all/1/2/3.png':
* The first section of the path, 'carto' specifies the provider.
* 'dark_all/1/2/3.png' specifies the path that will be appended to the base URL for the provider, allowing you the most freedom in making requests and providing authentication.
* Please refer to each providers website for T&Cs. The following providers are currently supported:
* 'carto': https://carto.com/
* 'mapbox': https://mapbox.com/
* 'planet': https://planet.com/
* 'osm': https://openstreetmap.org/
*/

//From: https://developers.cloudflare.com/workers/examples/cache-using-fetch
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  let provider = path.substr(1,path.indexOf("/",1)-1).toLowerCase();
  const pathWithoutProvider = path.substr(provider.length+2);
  let isValidProvider = false;
  let baseURL = "";
  switch(provider){
    case "carto":{
    isValidProvider = true;
    let serverNum = await random()%4;
    baseURL = `https://${serverNum}.basemaps.cartocdn.com/`;
    }
    break;
    case "mapbox":{
    isValidProvider=true;
    baseURL = "https://api.mapbox.com/styles/v1/";
    }
    break;
    case "planet":{
    isValidProvider=true;
    let serverNum = await random()%4;
    baseURL= `https://tiles${serverNum}.planet.com/basemaps/v1/planet-tiles/`;
    }
    break;
    case 'osm':{
    let letters = ["a","b","c"];
    let serverLetter = letters[random()%letters.length];
    baseURL = `https://${serverLetter}.tile.openstreetmap.org/`;
    }
    break;
    default:
    break;
  }

  //if it's not a valid provider, return a 404 response
  if(!isValidProvider){
    return new Response("404 - provider not found", { status: 404 })
  }
  //if there's no endpointURL, tell us
  if(!baseURL){
    return new Response(`501 - '${provider}' not implemented`, { status: 501 })
  }
  //otherwise, build a new request that retains the body and headers of the original one
  //just updating the URL
  let tempURL = new URL(baseURL+pathWithoutProvider);
  let newURL = new URL(request.url);
  newURL.pathname = tempURL.pathname;
  newURL.host = tempURL.host;
  newURL.protocol = tempURL.protocol;

  let newRequest = new Request(newURL, {
    body: request.body,
    headers: request.headers,
    method: request.method
  });

  let response = await fetch(newRequest, {
    cf: {
      // Always cache this fetch regardless of content type
      // for a max of 1 day before revalidating the resource
      cacheTtl: 86400,
      cacheEverything: true
    },
  })
  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response)

  // Set cache control headers to cache on browser for 1 day
  response.headers.set("Cache-Control", "max-age=86400");
  return response;
}


//use this method to return a random number from cloudflare
async function random(){
  let response = await fetch(new Request("https://drand.cloudflare.com/public/latest"));
  let object = await response.json();
  return await object.round;
}

addEventListener("fetch", event => {
  return event.respondWith(handleRequest(event.request))
})