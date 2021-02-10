/*
* Given a lat,long and a Mapbox access_token, query the reverse geocoding and tilequery APIs.
* Returns a JSON object with two keys: 'reverseGeocoding' and 'tileQuery'. The default values are two FeatureCollection geoJSON objects.
* Make query parameter 'simple' truthy to return arrays of string pairs instead. Column 1= label, Column 2=type.
*/

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

function simplifyFeatureGeoJson(feature) {
    let text = feature.text;
    //text is only a property of mapbox's reverse geocoding
    if (text) {
        return [text, feature.place_type[0]];
        //so other features must be from the tile query
    } else {
        let props = feature.properties;
        let keys = Object.keys(props).sort();
        //anonymize houses
        if (keys.indexOf("house_num") != -1) {
            return ["House", "Building"];
            //return elevation value, presumed metres?
        } else if (keys.indexOf("ele") != -1) {
            return ["" + props.ele, "Elevation"];
        } else {

            //console.log("" + keys);
            //console.log(props);

            let second = props.category_en || props["class"] || props.type || props.maki || "other";
            second = second == "bus" ? "bus " + (props.stop_type ? props.stop_type : "stop") : second;

            let first = props.name;
            //try to find names in other languages
            if (!first) {
                let nameKeys = keys.filter(key => key.indexOf("name") == 0);
                if (nameKeys.length > 0) {
                    let nameKey = nameKeys[0];
                    first = props[nameKey];
                }
            }

            //then use the structure
            if (!first) {
                first = props.structure && props.structure != "none" ? props.structure : null;
            }
            //then use the surface
            if (!first) {
                let surface = props.surface && props.surface != "none" ? props.surface : null;
                let type = props.type;
                first = surface ? surface + " " + type : null;
            }

            //then use the type property
            if (!first) {
                first = props.type;
            }

            //then fallback on the mapbox layer
            if (!first) {
                let layer = props.tilequery.layer;
                first = layer.indexOf("label") == -1 ? layer : null;
            }

            //if there really is nothing suitable, copy the second value
            first = !first ? second : first;

            //if the first value == "landuse", swap them
            let retValue = [first, second];
            if (first == "landuse") {
                retValue = [second, first];
            }
            return [formatStr(retValue[0]), formatStr(retValue[1])];
        }
    }
}

function formatStr(str) {
    str = str.replace("_", " ");
    let arr = str.split(" ");
    for (var i = 0; i < arr.length; ++i) {
        arr[i] = arr[i].substr(0, 1).toUpperCase() + arr[i].substring(1);
    }
    return arr.join(" ");
}

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
    /*
    * Parse incoming request
    */
    let url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname == "/") {
        return new Response('400 - no path name', { status: 400 });
    }
    let searchParams = url.searchParams;
    let accessToken = searchParams.get("access_token");
    if (!accessToken) {
        return new Response('401 - no access_token provided', { status: 401 });
    }
    let simple = searchParams.get("simple") ? true : false;
    /*
    * Feature collection
    */
    let geomOptions = ["point", "linestring", "polygon", ""]
    let featureCollection = null;
    for (var i = 0; i < geomOptions.length; ++i) {
        let geom = geomOptions[i];
        let mapBoxUrl = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2/tilequery${pathname}.json?radius=1000&limit=50${geom == "" ? "" : ("&geometry=" + geom)}&access_token=${accessToken}`;
        let request = new Request(mapBoxUrl);
        request.headers.set("Access-Control-Allow-Origin", "*");
        request.headers.set("Origin", new URL(mapBoxUrl).origin);
        let response = await fetch(request, {
            cacheTtl: 3600,
            cacheEverything: true,
            // For enterprise users:
            // Always cache this fetch regardless of content type for the following times:
            // success: 5 days
            // not found: 5 minutes
            // server errors: 5 seconds
            cacheTtlByStatus: { "200-299": 172800, 401: 5, 404: 300, "500-599": 5 }
        });

        let status = await response.status;
        if (status < 200 || status >= 300) {
            return response;
        }
        let featureJson = await response.json();
        if (featureCollection == null) {
            featureCollection = featureJson;
        } else {
            for (var j = 0; j < featureJson.features.length; ++j) {
                let feature = featureJson.features[j];
                if (featureCollection.features.indexOf(feature) == -1) {
                    featureCollection.features.push(feature);
                }
            }
        }

    }
    /*
    * Reverse Geocode
    */
    let reverseGeoCodeURL = `https://api.mapbox.com/geocoding/v5/mapbox.places${pathname}.json?types=country,region,postcode,district,place,locality,neighborhood,poi&access_token=${accessToken}`;
    let geoResponse = await fetch(new Request(reverseGeoCodeURL), {
        cacheTtl: 300,
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 172800, 401: 5, 404: 300, "500-599": 5 }
    });
    let status = await geoResponse.status;
    if (status < 200 || status >= 300) {
        return geoResponse;
    }
    let reverseJson = await geoResponse.json();
    /*
    * Create and send response
    */
    let workerResponseObj;
    if (simple) {
        workerResponseObj = {
            "reverseGeocoding": [],
            "tileQuery": []
        };
        //for every reverse json feature
        for (var j = 0; j < reverseJson.features.length; ++j) {
            let feature = reverseJson.features[j];
            let item = simplifyFeatureGeoJson(feature);
            if (!workerResponseObj.reverseGeocoding.some(row => row[0] == item[0] && row[1] == item[1])) {
                workerResponseObj.reverseGeocoding.push(item);
            }
        }
        //for every tile query feature
        for (var k = 0; k < featureCollection.features.length; ++k) {
            let feature = featureCollection.features[k];
            let item = simplifyFeatureGeoJson(feature);
            if (!workerResponseObj.tileQuery.some(row => row[0] == item[0] && row[1] == item[1])) {
                workerResponseObj.tileQuery.push(item);
            }
        }
        workerResponseObj.reverseGeocoding.sort();
        workerResponseObj.tileQuery.sort();
    } else {
        workerResponseObj = {
            "reverseGeocoding": reverseJson,
            "tileQuery": featureCollection
        };
    }
    let workerResponse = new Response(JSON.stringify(workerResponseObj), { status: 200 });
    workerResponse.headers.set("Cache-Control", "max-age=86400");
    // Set CORS headers
    workerResponse.headers.set("Access-Control-Allow-Origin", "*");
    return workerResponse;
}
