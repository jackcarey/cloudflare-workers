/**
 * An environemnt variable called GH_USERNAME should be added to this worker.
 */

addEventListener("fetch", event => {
    event.respondWith(handleRequest(event))
})

const keep_array_keys = (array_object, keys) => {
                try {
                    for (let item of array_object) {
                        for (let k of Object.keys(item)) {
                            if (keys.indexOf(k) == -1) {
                                delete item[k];
                            }
                        }
                    }
                    return array_object;
                } catch (e) {
                    console.log("keys", keys);
                    console.log("array", array_object);
                    throw e;
                }
            }

async function handleRequest(event) {
    // const age = 3600; // 1 hr
    const age = 2160; // 6 hrs
    const request = event.request;
    const cacheUrl = new URL(request.url);

    // Construct the cache key from the cache URL
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    // Check whether the value is already available in the cache
    // if not, you will need to fetch it from origin, and store it in the cache
    // for future access
    let response = await cache.match(cacheKey);
    if (!response) {
        let url = `https://api.github.com/users/${GH_USERNAME}/repos?&sort=updated&per_page=50&page=1`;
        const init = {
            headers: {
                'content-type': 'application/vnd.github+json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
            },
            cf: {
                // Always cache this fetch regardless of content type
                // for a max of 'age' before revalidating the resource
                cacheTtl: age,
                cacheEverything: true,
            },
        };
        console.log("fetching", url)
        response = await fetch(url, init);
        let data = await response.json();
        if (response.ok) {
            const keep = ["name", "full_name", "html_url", "description", "fork", "url", "tags_url", "languages_url", "contributors_url", "subscribers_url", "deployments_url", "created_at", "updated_at", "pushed_at", "homepage", "size", "stargazers_count", "watchers_count", "language", "license", "topics", "watchers"]
            data = keep_array_keys(data, keep)
            const deep_urls = ["tags_url", "languages_url", "contributors_url", "subscribers_url", "deployments_url"];
            for (let i in data) {
                try {
                    let repo = data[i];
                    for (let deep_url_key of deep_urls) {
                        let repo_keys = Object.keys(repo);
                        if (repo_keys.indexOf(deep_url_key) == -1) {
                            throw new Error("deep url key not found", `'${deep_url_key}'`, `'${repo_keys.join(",")}'`);
                        }
                        const deep_url = repo[deep_url_key];
                        const query_params = deep_url_key == "tags_url" ? "?sort=updated&order=desc&per_page=5" : deep_url_key == "deployments_url" ? "?sort=updated&order=desc" : "";
                        const full_deep_url = `${deep_url}${query_params}`;
                        console.log("fetching", deep_url_key, full_deep_url);
                        const deep_resp = await fetch(full_deep_url, init);
                        let deep_data = await deep_resp.json();
                        switch (deep_url_key) {
                            case "tags_url":
                                if (deep_data.length) {
                                    // add the commit date of each tag to the data
                                    // so that they can be sorted by data
                                    for (let tag of deep_data) {
                                        console.log("fetching", tag.commit.url);
                                        const commit_resp = await fetch(tag.commit.url, init);
                                        const commit_json = await commit_resp.json();
                                        deep_data["commit_date"] = commit_json.commit.committer.date;
                                    }
                                    deep_data = Array.from(deep_data).sort((a, b) => {
                                        return b.commit_date > a.commit_date;
                                    });
                                    let keep = ["name", "zipball_url", "tarball_url"]
                                    deep_data = keep_array_keys(deep_data, keep);
                                }
                                //now the tags have been sorted and filtered, keep only the latest one
                                data[i][deep_url_key] = deep_data.length ? deep_data[0] : [];
                                break;
                            case "contributors_url":
                            case "subscribers_url":
                                let k = deep_url_key.replace("_url", "_count");
                                // don't keep the full response for this deep URL
                                data[i][k] = deep_data.length;
                                delete data[i][deep_url_key]
                                break;
                            case "deployments_url":
                                //sort by last updated
                                deep_data = Array.from(deep_data).sort((a, b) => b.updated_at > a.updated_at);
                                //then get the most recent successful deployment for each environment
                                for (let j in deep_data) {
                                    let deployment = deep_data[j];
                                    console.log("d", deployment)
                                    console.log("fetching", deployment.statuses_url);
                                    let statuses_resp = await fetch(deployment.statuses_url, init);
                                    let statuses_json = await statuses_resp.json();
                                    statuses_json = Array.from(statuses_json).filter(x => {
                                        let has_url = x?.environment_url?.length || 0 > 0;
                                        let good_state = x.state == "success";
                                        return good_state && has_url;
                                    });
                                    statuses_json.sort((a, b) => b.updated_at > a.updated_at)
                                    deep_data[j] = statuses_json.length ? statuses_json[0] : [];
                                    data[i][deep_url_key] = deep_data;
                                }
                                break;
                            default:
                                data[i][deep_url_key] = deep_data;
                                break;
                        }
                    }
                } catch (e) {
                    if (e.message.indexOf("Too many subrequests") != -1) {
                        console.log(e);
                    } else {
                        throw (e);
                    }
                }
            }
        }

        // Must use Response constructor to inherit all of response's fields
        response = new Response(JSON.stringify(data), response);
        // Cache API respects Cache-Control headers. Setting s-max-age to 10
        // will limit the response to be in cache for 10 seconds max
        // Any changes made to the response here will be reflected in the cached value
        response.headers.append('Cache-Control', `s-maxage=${age}`);
        // Store the fetched response as cacheKey
        // Use waitUntil so you can return the response without blocking on
        // writing to cache
        event.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
}
