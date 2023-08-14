export default {
  async fetch(request, env,ctx) {
    const cacheSeconds = 86400; //1 day
    const url = new URL(request.url);
    // Construct the cache key from the cache URL
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    // Check whether the value is already available in the cache
    // if not, you will need to fetch it from origin, and store it in the cache
    let resp = await cache.match(cacheKey);

    if (!resp) {
      const {hostname, pathname} = url;
      let str = "";
      if(hostname.endsWith("workers.dev")){
        str = "🌤️";
      }else if(hostname.includes("elepant")){
        str = "🐘";
      }
      const style = `<style>body{display:flex;justify-content:center;align-items:center;vertical-align:middle;text-align:center;font-size:25vmin;font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";}</style>`;
      const res = !str ? url : `${style}<span>${str}</span>`;
      const init = {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "Cache-Control": `max-age=${cacheSeconds}`,
      },
    }
      resp = new Response(res, init);
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    }
    return resp;
  }
}
