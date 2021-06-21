const hctiURL = "https://hcti.io/v1/image";
let defaultImageURL = new URL(`${hctiURL}/${DEFAULT_IMAGE_ID}.webp`);
const user = USER;
const apiKey = API_KEY;
//https://docs.htmlcsstoimage.com/getting-started/using-the-api#creating-an-image
const basicAuth = btoa(USER + ":" + API_KEY);
let cacheSeconds = 86400 * 2;
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
const fallbackThemes = ["color","tech","texture"];

addEventListener("fetch", (event) => {
    event.respondWith(
        handleRequest(event.request)
    );
});

function dateDifference(d1,d2){
    let max = Math.max(d1,d2);
    let min = Math.min(d1,d2);
    return Math.ceil((max - min) / 1000);
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

async function resetKVDT(key) {
    if (CAN_RESET_CACHE == "true") {
        let maxSeconds = 3600;
        let obj = JSON.parse(await PROFILE_IMAGE.get(key));
        let dateDiff = obj!=null && obj.dt !=null ? dateDifference(new Date(),obj.dt) : maxSeconds;
        console.log(`${key} diff: ${dateDiff}`);
        if(dateDiff >= maxSeconds){
            obj.dt = new Date(0,0,1);
            await PROFILE_IMAGE.put(key,JSON.stringify(obj));
        }
    }
}

async function resetKVDatetimes() {
    if (CAN_RESET_CACHE == "true") {
        let list = await PROFILE_IMAGE.list();
        let cursor = "";
        do {
            if (list.keys.length > 0) {
                for (let i = 0; i < list.keys.length; ++i) {
                    let key = list.keys[i].name;
                    await resetKVDT(key);
                }

                if (!list.list_complete) {
                    cursor = list.cursor;
                    list = await PROFILE_IMAGE.list({ "cursor": cursor });
                }
            }
        } while (!list.list_complete && list.keys.length > 0);
        return new Response("cache reset complete");
    } else {
        return new Response("cache not reset");
    }
}

function formatSeconds(value){
    //works between 0 and 31 days
    if(value>2678400){
        return value + " seconds";
    }else{
    let dt = new Date(value*1000);
    let days = dt.getDate()-1;
    let hours = dt.getHours();
    let mins = dt.getMinutes();
    let seconds = dt.getSeconds();
    let str = "";
    if(days>0){
        str+= days+" days ";
    }
    if(hours>0){
        str += hours+" hours ";
    }
    if(mins>0){
        str+= mins+" mins ";
    }
    if(seconds>0){
        str+=seconds+" seconds";
    }
    return str.trim();
    }
}

async function deleteHCTIImage(id) {
    if (CAN_DELETE_IMAGES == "true") {
        if (id!=null) {
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
    try{
    let html = `<!DOCTYPE html><title>Profile Image Themes</title><link rel="icon" href="https://jackcarey.co.uk/favicon.ico" /><style>*{text-align:center;}div{display:flex;justify-content:space-around;flex-wrap:wrap;}</style><body><div>`;
    let themeNames = Object.keys(themes).sort();
    for(var i=0;i<themeNames.length;++i){
        let name = themeNames[i];
        let stored = await PROFILE_IMAGE.get(name);
        let age = 0;
        let objDT = 0;
        if(stored!=null){
            let obj = JSON.parse(stored);
            objDT = new Date(obj.dt);
            age = dateDifference(new Date(),objDT);
        }
        html +="<span>";
        html += `<a href="/${name}"><img id="img-${name}" src="/${name}?96"><br><b>${name}</b></a>`;
        html += `<br><i>${formatSeconds(age)} ago</i>`;
        html+="</span>";
    }
    html+= "</div></body>";
    return new Response(html,{
    headers: {
      "content-type": "text/html;charset=UTF-8"
    }
    });
                    }catch(e){
            console.log(`${e.message}`);
            console.log(e);
            return new Response(e.message);
                    }
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

async function fetchNewHCTI(theme,themeName) {

    const HCTI_ERROR = await PROFILE_IMAGE.get("HCTI_ERROR");
    if (HCTI_ERROR == null) {
        
        let fgData = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>YOUR_FOREGROUND_SRC</text></svg>";
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
            let imageURL = new URL(json["url"] + ".webp");
            let obj = {};
                obj.dt = new Date();
                obj.url = imageURL;
                await PROFILE_IMAGE.put(themeName, JSON.stringify(obj));
            return imageURL;
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
try{
    //cacheSeconds may be increased in order to reduce the number of requests made to HCTI
    cacheSeconds = 86400 * (2 + Date.now()%5 );
    
    const { pathname, search } = new URL(request.url);

    const requestedWidth = search && !isNaN(parseInt(search.substr(1))) ? Math.max(32, parseInt(search.substr(1))) : null;

    if (pathname.toUpperCase() == "/THEMES") {
        return listThemes();
    } else if (pathname.toUpperCase() == "/CLEARCACHE") {
        return await emptyKV();
        } else if (pathname.toUpperCase() == "/RESETCACHE") {
        return await resetKVDatetimes();
    } else if (pathname.toUpperCase().startsWith("/DELETE")) {
        let deleteID = "";
        try {
            deleteID = pathname.toUpperCase().replace("/DELETE-", "");
            return deleteHCTIImage(deleteID);
        } catch (e) {
            return new Response(`Error deleting ID: ${deleteID}`,500);
        }
    } else {
        if (requestedWidth) {
            defaultImageURL.searchParams.set("width", requestedWidth);
        }

        //removes any file exts from the url
        let themeName = pathname.substring(1).toLowerCase()
        if (themeName.indexOf(".") != -1) {
            themeName = themeName.replace(new RegExp("\.[0-9A-z]+", "gm"), "");
        }
        const themeNames = Object.keys(themes);
        //if the theme isn't found, default on the first one
        if (themeNames.indexOf(themeName) == -1) {
            console.log(`'${themeName}' not found in list ${Object.keys(themes).sort().join()}`);
            var options = fallbackThemes || [themeNames[0]];
            var index = Date.now()%options.length;
            themeName = options[index];
        }
        console.log("Using theme: " + themeName)

        const theme = themes[themeName];
        const storedStr = await PROFILE_IMAGE.get(themeName);
        const stored = JSON.parse(storedStr);

        //the stored object has 'url' and 'dt' keys
        const storedURL = stored && stored.url ? new URL(stored.url) : null;
        const storedDT = stored && stored.dt ? new Date(stored.dt) : null;
        const storedDiff = stored && storedDT ? dateDifference(new Date(),storedDT) : -1;

        let storedFetchOK = storedURL ? await doesHCTIImageExist(storedURL) : false;
        let isRecent = storedDiff >= 0 && storedDiff < cacheSeconds;

        console.log(`Stored URL exists: ${storedFetchOK} Seconds: ${storedDiff}`);
        console.log(`isRecent: ${isRecent} | ${cacheSeconds}`);
        
        if (requestedWidth && storedURL) {
                storedURL.searchParams.set("width", requestedWidth);
            }

        if (storedURL && isRecent && storedFetchOK) {
            console.log("Stored URL is recent");
            return Response.redirect(storedURL, 302);
        } else {
            console.log("Fetching new image");
            //fetch the new image for this theme, or null if there is an issue
            let imageURL = await fetchNewHCTI(theme,themeName);
            if (imageURL != null) {
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
                }catch(e){
            console.log(`${e.message}`);
            console.log(e);
            return Response.redirect(defaultImageURL,307);
        }
}
