/*
* Use this worker to trigger a Netlify build hook (https://docs.netlify.com/configure-builds/build-hooks/) via a GET request and then redirect to your app.
* This allows you to enter the worker URL in the browser to trigger a build, which can be useful for sharing with others.
* To specify the trigger message, add it as the query string. E.g: https://your-worker-url.example.workers.dev/?Build+from+GET+request
* Hint: Configure Netlify to build only from a branch that doesn't exist to effectively disable continuous deployment.
        You'll still be able to build from this worker by specifying an existing branch in `buildBranch`.
*/
const netlifyAppUrl = "https://your-app.netlify.app";
const netlifybuildUrl = "https://api.netlify.com/build_hooks/xxxxxxxxxxxxxx";
const buildBranch = 'main';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
  let requestURL = new URL(request.url);
  let msg = requestURL.search ? requestURL.search.substr(1) : "Build from GET request";
  let buildURL = netlifybuildUrl + "?trigger_branch=" + buildBranch + "&trigger_title=" + msg;
  let buildRequest = new Request(buildURL,{
    method:'POST'
  });
  let response = await fetch(buildRequest);
  if(response.status>=200 && response.status<300){
      return Response.redirect(netlifyAppUrl,301);
  }else{
      return response;
  }
}
