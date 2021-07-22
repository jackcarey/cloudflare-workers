/**
 * A worker to return basic content for a given request.
 * Intended to return short text, emoji from multiple domains, addresses, paths.
 * 
 * Checks are completed in the following order:
 *   1. fromMap[pathname]
 *   2. toMap[pathanme]
 *   3. fromMap[hostname]
 *   4. toMap[hostname]
 *   5. fromMap[origin]
 *   6. toMap[origin]
 *   7. countryMap[countryCode]
 *   8. [country code emoji]
 *   9. [debugging object]
 * 
 * You can use functions to return strings. E.g. "/sun",()=>randomString(["☀","🌞"])
 * Results will be sent to the Cloudflare cache for 28 days
 */

  const fromMap = {
      "https://dash.cloudflare.com/": "☁",
      "example.com":()=>randomString(["⚫",⚪",🔴","🟠","🟡",🟢","🔵","🟣","🟤"]),
  };

  const toMap = {
    "YOUR-WORKER-ADDRESS.workers.dev":"☁",
    "/sun":()=>randomString(["☀","🌞"])
  };

  //when a country code is used, it's flag will be shown by default
  //you can override that here
  const countryMap = {
    "US":"🇺🇸"
  };


addEventListener("fetch", (event) => {
  event.respondWith(
    handleEvent(event).catch(
      (err) => new Response(err.stack, { status: 500 })
    )
  );
});

async function handleEvent(event) {
  const {request} = event;
  const {headers,url,cf} = request;
  const { pathname,hostname,origin } = new URL(url);

  let cachedResponse = await caches.default.match(request)
  if(cachedResponse){
    return cachedResponse;
    }

  const from = headers.get('origin') || headers.get('referer')
  const country = (cf ? cf.country : null) || headers.get("CF-IPCountry");

  let value = fromMap[pathname] || toMap[pathname]
           || fromMap[hostname] || toMap[hostname]
           || fromMap[origin] || toMap[origin]
           || countryMap[country]
           || alpha2emoji(country)
           || JSON.stringify({from,url,country}) //fallback for debugging

  //if the value is a function then run it
  if(value && typeof value==="function"){
    value = value();
  }

  const init = {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "Cache-Control": `max-age=${86400*28},s-maxage=${86400*28}`,
    },
  }

  //this styling allows for color emoji in the system style
  let result = `<style>*{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";}</style>${value}`;

  let response = new Response(result,init)
  
  //cache the result on Cloudflares edge network (for custom domains only)
  //event.waitUntil(caches.default.put(request, response.clone()))

  return response;
}

function alpha2emoji(country){
  if(!country){
    return null;
  }
  const offset = 127397;
  const A = 65;
  const Z = 90;
	const f = country.codePointAt(0);
	const s = country.codePointAt(1);

	if (
		country.length !== 2
		|| f > Z || f < A
		|| s > Z || s < A
	){
		return null;
    }else{

	return String.fromCodePoint(f + offset)
		+String.fromCodePoint(s + offset);
    }
}

function randomString(array){
  return array[Math.floor(Math.random()*array.length)];
}
