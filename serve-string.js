/**
 * A worker to return basic content for a given request.
 * Intended to return short text, emoji from multiple domains, addresses, paths.
 * 
 * Checks are completed in the following order:
 *   1. fromMap[from]
 *   2. fromMap[from.pathname]
 *   3. fromMap[from.hostname]
 *   4. fromMap[from.origin]
 *   5. fromContainsMap - does the origin/referer URL contain any of these keys?
 *   6. toMap[url]
 *   7. toMap[url.pathname]
 *   8. toMap[url.hostname]
 *   9. toMap[url.origin]
 *   10. toContainsMap - does the request URL contain any of these keys?
 *   11. countryMap[countryCode]
 *   12. [country code emoji]
 *   13. [debugging object]
 * 
 * You can use functions to return strings. E.g. "/sun",()=>randomString(["☀","🌞"])
 * Results will be sent to the Cloudflare cache
 */
 const cacheDays = 7;

  const fromMap = {
      "https://dash.cloudflare.com/": "☁",
      "example.com":()=>randomString(["⚫","⚪",🔴","🟠","🟡",🟢","🔵","🟣","🟤"])
  };

  const toMap = {
    "/sun":()=>randomString(["☀","🌞"])
  };

  const fromContainsMap = {
    "workers.dev":()=>randomString(["☁","🌩","🌥"])
  }
  
  const toContainsMap = {
    "weather":()=>randomString(["☀","🌧","🌨","⛈","🌦","⛅","🌤","🌥","🌩","🌪","🌫","❄"])
  }
  

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
    let cachedResponse = await caches.default.match(request);
    if(cachedResponse){
      return cachedResponse;
    }
    
    let from = headers.get('origin') || headers.get('referer')
    if(from){
      from = new URL(from);
    }
    const country = (cf ? cf.country : null) || headers.get("CF-IPCountry");
    
    //set up a result in case there are no results from the from/to maps
    let value = null;
    
    //try fetching from the maps, if this fails the value will be left as the country or debugging content
    try{
    value = fromMap[from.toString()]
    || fromMap[from.pathname]
    || fromMap[from.hostname]
    || fromMap[from.origin] || null
    }catch(e){}
    
    if(!value){
      let keys = Object.keys(fromContainsMap);
      for(var index in keys){
          let key = keys[index];
        if(from&&from.toString().indexOf(key)!=-1){
          value = fromContainsMap[key];
          break;
        }
      }
    }
    
    if(!value){
      try{
      value = toMap[url.pathname]
      || toMap[url.hostname]
      || toMap[url.origin]
      || value;
      }catch(e){}
    }
    
    if(!value){
        let keys = Object.keys(toContainsMap);
      for(var index in keys){
          let key = keys[index];
        if(url.toString().indexOf(key)!=-1){
          value = toContainsMap[key];
          break;
        }
      }
    }
    
    if(!value){
      value = countryMap[country] || alpha2emoji(country) || JSON.stringify({from,url,country});
    }
    
    //if the value is a function then run it
    if(value && typeof value==="function"){
      value = value();
    }
    
    const init = {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "Cache-Control": `max-age=${86400*cacheDays}`,
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