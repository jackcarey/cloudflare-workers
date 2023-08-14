addEventListener("fetch", (event) => {
  event.respondWith(
    handleRequest(event).catch(
      (err) => new Response(err.stack, { status: 500 })
    )
  );
});

const countryStrings = {
  "NZ":{
    "greeting":"Kia ora"
    },
  "FR":{
    "greeting":"Bonjour"
    }
  };

async function handleRequest(event) {
  const req = event.request;
  const cfCountry = req?.cf?.country;
  const cacheKey = `${cfCountry}-${req.url}`;

  const cache = caches.default;

  // Check whether the value is already available in the cache
  // if not, you will need to fetch it from origin, and store it in the cache
  // for future access
  let response = await cache.match(cacheKey);

  if(!response){

  let res = await fetch(req);
  const contentType = res.headers.get('Content-Type');
  // Must use Response constructor to inherit all of response's fields
  res = new Response(res.body, response);
  // Any changes made to the response here will be reflected in the cached value
  // 30 days
  res.headers.append('Cache-Control', 's-maxage=259000000');

  // If the response is HTML, and there are translations available for this country
  // it can be transformed with HTMLRewriter
  // otherwise, it should pass through
  const countryHasKeys = cfCountry && Object.keys(countryStrings).indexOf(cfCountry) != -1;
  if (contentType?.startsWith('text/html') && countryHasKeys) {
    try{
      // Store the fetched response as cacheKey
    // Use waitUntil so you can return the response without blocking on
    // writing to cache
    event.waitUntil(cache.put(cacheKey, res.clone()));
      return new HTMLRewriter().on('[data-i18n-key]', new I18nReplacementHandler(cfCountry)).transform(res);
    }catch(e){
      return res;
    }
  } else {
    // Store the fetched response as cacheKey
    // Use waitUntil so you can return the response without blocking on
    // writing to cache
    event.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }
  }
}


class I18nReplacementHandler {
  constructor(countryCode) {
    this.strings = countryStrings[countryCode] || null;
  }
  element(element) {
    const i18nKey = element.getAttribute('data-i18n-key');
    if (i18nKey && this.strings && this.strings[i18nKey]) {
      const translation = this.strings[i18nKey];
      if (translation) {
        element.setInnerContent(translation);
      }
    }
  }
}
