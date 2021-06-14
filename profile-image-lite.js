const hctiURL = "https://hcti.io/v1/image";
let defaultImageURL = new URL(`${hctiURL}/${DEFAULT_IMAGE_ID}.webp`);
const user = USER;
const apiKey = API_KEY;
//https://docs.htmlcsstoimage.com/getting-started/using-the-api#creating-an-image
const basicAuth = btoa(USER + ":" + API_KEY);
const cacheSeconds = 86400 * 2;
//should terms from themes be combined, or a random one chosen
const useRandomTerm = true;
//each theme must have a 'terms' array but the 'suffixes' array is optional
//the first key is used as the default
const themes = {
    "color":{"terms":["color","colour","rainbow"],suffixes:["pattern","texture","wallpaper"]},
    "tech": { "terms": ["software", "code", "programming", "HTML"], "suffixes": ["pattern", "background"] },
    "art": { "terms": ["street", "pop", "modern", "bright", "painting","color"], "suffixes": ["art"] },
    "texture": { "terms": ["texture", "textures", "pattern", "patterns"] },
    "nature": { "terms": ["nature", "jungle"] },
    "architecture": { "terms": ["architecture"] },
    "interior": { "terms": ["interior", "office"] }
};

addEventListener("fetch", (event) => {
    event.respondWith(
        handleRequest(event.request)
    );
});

async function clientCacheResponse(response, seconds = 0) {
    try {
        seconds = seconds <= 0 ? cacheSeconds : seconds;
        response = new Response(response.body, response);
        response.headers.set("Cache-Control", `max-age=${seconds}`);
        console.log("changed cache-control to " + response.headers.get("Cache-Control"));
        return response;
    } catch (e) {
        console.log("error setting cache-control: " + e.message);
        return response;
    }
}

async function clearKVItem(key) {
    if (CAN_CLEAR_CACHE == "true") {
        await PROFILE_IMAGE.delete(key);
    }
}

async function emptyKV() {
    if (CAN_CLEAR_CACHE == "true") {
        let list = await PROFILE_IMAGE.list();
        let cursor = "";
        do {
            if (list.keys.length > 0) {
                for (let i = 0; i < list.keys.length; ++i) {
                    let key = list.keys[i].name;
                    await clearKVItem(key);
                }

                if (!list.list_complete) {
                    cursor = list.cursor;
                    list = await PROFILE_IMAGE.list({ "cursor": cursor });
                }
            }
        } while (!list.list_complete && list.keys.length > 0);
        return new Response("cache clear complete");
    } else {
        return new Response("cache not cleared");
    }
}

async function deleteHCTIImage(id) {
    if (CAN_DELETE_IMAGES == "true") {
        if (id) {
            if (id != DEFAULT_IMAGE_ID) {
                const init = {
                    "method": "DELETE",
                    "headers": {
                        "Authorization": "Basic " + basicAuth
                    }
                };
                return await fetch(hctiURL + "/" + id, init);
            } else {
                return new Response("You shouldn't delete the default image")
            }
        } else {
            return new Response("no ID to delete");
        }
    } else {
        return new Response("cannot delete images");
    }
}

async function listThemes() {
    return new Response(Object.keys(themes).sort().join());
}

async function doesHCTIImageExist(url) {
    let exists = false;
    const cacheKey = "CACHED-" + url;
    const cachedStoredFetch = await PROFILE_IMAGE.get(cacheKey);
    //if we don't know either way if a URL exists then we must check it
    if (cachedStoredFetch == null) {
        let storedFetch = await fetch(url);
        exists = storedFetch.ok;
        await PROFILE_IMAGE.put(cacheKey, (exists ? "true" : "false"), { expirationTtl: 14400 }); //4 hrs
    } else {
        exists = cachedStoredFetch == "true";
    }
    return exists;
}

async function fetchNewHCTI(theme) {

    const HCTI_ERROR = await PROFILE_IMAGE.get("HCTI_ERROR");
    if (HCTI_ERROR == null) {

        //2018 headshot w no bg
        let fgData = "YOUR_FOREGROUND_SRC";
        let w = 1024;
        let h = 1024;

        let deviceScale = 1;
        const bgTerms = theme["terms"];
        const suffixes = theme["suffixes"] || [""];

        let urlTerm = "";
        if (useRandomTerm) {
            let rand1 = new Date().getTime() % bgTerms.length;
            let rand2 = new Date().getTime() % suffixes.length;
            urlTerm = encodeURIComponent((bgTerms[rand1] + " " + suffixes[rand2]).toLocaleLowerCase().trim());
        } else {
            let queryStrs = [];
            for (let i = 0; i < bgTerms.length; ++i) {
                for (let j = 0; j < suffixes.length; ++j) {
                    let term = (bgTerms[i] + " " + suffixes[j]).toLowerCase().trim();
                    queryStrs.push(encodeURIComponent(term));
                }
            }
            urlTerm = queryStrs.join(",");
        }
        console.log("Using term(s): "+urlTerm);

        let bgURL = `https://source.unsplash.com/daily?${urlTerm}`;
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

        const cfObj = {
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
            return new URL(json["url"] + ".webp");
        } else {
            const msg = `${json.error}. Status Code: ${json.statusCode}.${json.message}`;
            await PROFILE_IMAGE.put("HCTI_ERROR", msg, { expirationTtl: 14400 }); //4hrs
            console.log(msg);
            return null;
        }
    } else {
        console.log(`Cooling off. Recent HCTI requests failed: ${HCTI_ERROR}`);
        return null;
    }
}

/**
 * Using the htmltoimage API
 *   https://docs.htmlcsstoimage.com/example-code/javascript
 * A namespace must be bound to 'PROFILE_IMAGE'
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {

    const { pathname, search } = new URL(request.url);

    const requestedWidth = search && !isNaN(parseInt(search.substr(1))) ? Math.max(32, parseInt(search.substr(1))) : null;

    if (pathname == "/THEMES") {
        return listThemes();
    } else if (pathname == "/CLEARCACHE") {
        return await emptyKV();
    } else if (pathname.startsWith("/DELETE")) {
        const deleteID = "";
        try {
            deleteID = pathname.replace("/DELETE-", "");
        } catch (e) { } //if the ID can't be parsed, no image will be deleted
        return deleteHCTIImage(deleteID);
    } else {
        if (requestedWidth) {
            defaultImageURL.searchParams.set("width", requestedWidth);
        }

        //removes any file exts from the url
        let themeName = pathname.substring(1).toLowerCase()
        if (themeName.indexOf(".") != -1) {
            themeName = themName.replace(new RegExp("\.[0-9A-z]+", "gm"), "");
        }
        const themeNames = Object.keys(themes);
        //if the theme isn't found, default on tech
        if (themeNames.indexOf(themeName) == -1) {
            console.log(`${themeName} not found in list ${Object.keys(themes).sort().join()}`);
            themeName = themeNames[0];
        }
        console.log("Using theme: " + themeName)

        const theme = themes[themeName];
        const storedStr = await PROFILE_IMAGE.get(themeName);
        const stored = JSON.parse(storedStr);

        //the stored object has 'url' and 'dt' keys
        const storedURL = stored && stored.url ? new URL(stored.url) : null;
        const storedDT = stored && stored.dt ? new Date(stored.dt) : null;
        const storedDiff = stored && storedDT ? Math.ceil((Date.now() - storedDT) / 1000) : -1;

        let storedFetchOK = storedURL ? await doesHCTIImageExist(storedURL) : false;

        console.log(`Stored exists: ${storedFetchOK} ${storedFetchOK ? `Difference: ${storedDiff}` : ""}`);

        if (storedURL && storedDiff >= 0 && storedDiff < cacheSeconds && storedFetchOK) {
            console.log("Stored URL is recent");
            if (requestedWidth) {
                storedURL.searchParams.set("width", requestedWidth);
            }
            return Response.redirect(storedURL, 302);
        } else {
            console.log("Fetching new image");
            //fetch the new image for this theme
            let imageURL = await fetchNewHCTI(theme);

            if (imageURL != null) {
                let obj = {};
                obj.dt = new Date();
                obj.url = imageURL;
                await PROFILE_IMAGE.put(themeName, JSON.stringify(obj));
                if (requestedWidth) {
                    imageURL.searchParams.set("width", requestedWidth);
                }
                return Response.redirect(imageURL, 302);
            } else {
                console.log(`Image creation issue, returning ${storedFetchOK ? "stored" : "default"} URL`);
                return Response.redirect(storedFetchOK ? storedURL : defaultImageURL, 307);
            }
        }
    }
}
