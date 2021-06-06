const hctiURL = "https://hcti.io/v1/image";
const defaultImageID = "YOUR_DEFAULT_IMAGE_ID";
let defaultImageURL = hctiURL + "/" + defaultImageID;
const user = "HCTI_USER_ID";
const apiKey = "HCTI_API_KEY";
//each theme must have a 'terms' array but the 'suffixes' array is optional
const themes = {
    "art": { "terms": ["street", "pop", "modern", "bright", "painting"], "suffixes": ["art"] },
    "texture": { "terms": ["texture", "textures", "pattern", "patterns"] },
};

addEventListener("fetch", (event) => {
    event.respondWith(
        handleRequest(event.request)
    );
});

/**
 * Using the htmltoimage API
 *   https://docs.htmlcsstoimage.com/example-code/javascript
 * A namespace must be bound to 'PROFILE_IMAGE'
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {

    const { pathname, search } = new URL(request.url);
    //https://docs.htmlcsstoimage.com/getting-started/using-the-api#creating-an-image
    const basicAuth = btoa(user + ":" + apiKey);

    if (pathname == "/CLEARCACHE") {
        let list = await PROFILE_IMAGE.list();
        let cursor = "";
        do {
            if (list.keys.length > 0) {
                for (let i = 0; i < list.keys.length; ++i) {
                    let key = list.keys[i].name;
                    await PROFILE_IMAGE.delete(key);
                }

                if (!list.list_complete) {
                    cursor = list.cursor;
                    list = await PROFILE_IMAGE.list({ "cursor": cursor });
                }
            }
        } while (!list.list_complete && list.keys.length>0);
    } else if (pathname.startsWith("/DELETE")) {
        const deleteID = pathname.replace("/DELETE-", "");
        if (deleteID != defaultImageID) {
            const init = {
                "method": "DELETE",
                "headers": {
                    "Authorization": "Basic " + basicAuth
                }
            };
            return await fetch(hctiURL + "/" + deleteID, init);
        } else {
            return new Response("you shouldn't delete the default image")
        }
    } else {


        let themeName = pathname.substring(1).toLowerCase();
        if (Object.keys(themes).indexOf(themeName) == -1) {
            themeName = "tech";
        }
        //console.log(Object.keys(themes).join()+" "+themeName+"@"+Object.keys(themes).indexOf(themeName));
        const requestedWidth = search && !isNaN(parseInt(search.substr(1))) ? Math.max(32, parseInt(search.substr(1))) : null;

        if (requestedWidth) {
            defaultImageURL += "?width=" + requestedWidth;
        }

        const theme = themes[themeName];

        const bgTerms = theme["terms"];
        const suffixes = theme["suffixes"] || [""];
        const cacheKey = themeName;
        let stored = await PROFILE_IMAGE.get(cacheKey);
        if (stored) {
            if (requestedWidth) {
                stored += "?width=" + requestedWidth;
            }
            console.log("fetching stored from " + stored);
            let storedResponse = await fetch(stored);
            if (storedResponse.ok) {
                return storedResponse;
            } else {
                console.log("actually serving " + defaultImageURL);
                return await fetch(defaultImageURL);
            }
        } else {


            //2018 headshot w no bg
            let fgData = "YOUR_FOREGROUND_IMG_SRC";
            let w = 1024;
            let h = 1024;

            let deviceScale = 1;

            let urlTerm = "";
            let queryStrs = [];
            for (let i = 0; i < bgTerms.length; ++i) {
                for (let j = 0; j < suffixes.length; ++j) {
                    let term = (bgTerms[i] + " " + suffixes[j]).toLowerCase().trim();
                    queryStrs.push(encodeURIComponent(term));
                }
            }

            let bgURL = `https://source.unsplash.com/daily?${queryStrs.join(",")}`;
            let html = `<style>
    body { 
      background-color: transparent;
  }
  #fg,#bg{
    position:absolute;
    top:0;
    left:0;
  }
  #fg{
    filter:drop-shadow(0 0 0.75em rgba(60,60,60,0.5));
  }
  #bg{
    object-fit:cover;
  }</style>
  <img id="bg" src="${bgURL}" width="${w}" height="${h}"/>
  <img id="fg" src="${fgData}" width="${w}" height="${h}"/>`;

            const cacheSeconds = 86400 * 2;
            const cfObj = {
                // Always cache this fetch regardless of content type
                // for a max of 3 days seconds before revalidating the resource
                cacheTtl: cacheSeconds,
                cacheEverything: false
            };

            const init = {
                cf: cfObj,
                body: JSON.stringify({ "html": html, "device_scale": deviceScale, "viewport_height": h, "viewport_width": w }),
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "Authorization": "Basic " + basicAuth
                },
            };

            const response = await fetch(hctiURL, init);
            const json = await response.json();
            const jsonErr = Object.keys(json).indexOf("statusCode") != -1 && (json.statusCode >= 300 || json.statusCode < 200);
            if (response.ok && !jsonErr) {
                let imageURL = json["url"] + ".webp";
                //store the url on CF for the given theme
                PROFILE_IMAGE.put(cacheKey, imageURL, { expirationTtl: cacheSeconds });
                if (requestedWidth) {
                    imageURL += "?width=" + requestedWidth;
                }
                let imgResponse = await fetch(imageURL);
                if (imgResponse.ok) {
                    return imgResponse;
                } else {
                    return await fetch(defaultImageURL);
                }
            }
            else {
                console.log(`${response.ok ? "" : "Response not ok"} | ${jsonErr ? "JSON Error" : ""}`);
                return await fetch(defaultImageURL);
            }
        }
    }
}
