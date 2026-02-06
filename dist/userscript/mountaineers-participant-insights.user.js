// ==UserScript==
// @name         Mountaineers Participant Insights
// @namespace    npm/mountaineers-participant-insights
// @version      0.10.0
// @author       Daryl Harrison
// @description  Provides Mountaineers leaders with participant statistics and notes.
// @icon         https://img.icons8.com/external-regular-kawalan-studio/48/external-calendar-cross-date-time-regular-kawalan-studio.png
// @source       https://github.com/darylharrison/mountaineers-participant-insights.git
// @match        https://www.mountaineers.org/*
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const run = (window, workerUrl) => {
    const $ = window.$;
    console.log("Mountaineers Participant Insights loaded");
    let tasksQueue;
    let userDataWorker;
    const isLeader = () => {
      var _a, _b, _c;
      return ((_c = (_b = (_a = window.UserVoice) == null ? void 0 : _a.globalOptions) == null ? void 0 : _b.ticket_custom_fields) == null ? void 0 : _c["User Role"]) === "Leader";
    };
    const initPage = () => {
      initTasksQueue();
      initWorker();
      cleanCache();
      injectStyles();
    };
    const initTasksQueue = () => {
      if (tasksQueue) return;
      tasksQueue = [];
      const originalPush = tasksQueue.push;
      tasksQueue.push = (...args) => {
        const length = originalPush.apply(tasksQueue, args);
        processQueue();
        return length;
      };
    };
    const initWorker = () => {
      if (userDataWorker) return;
      userDataWorker = new Worker(workerUrl);
      userDataWorker.onmessage = (event) => {
        const { username, result } = event.data;
        if (!result.error) {
          try {
            const dateKey = getLocalDateString();
            window.localStorage.setItem(`mountaineers_cancellations_${dateKey}_${username}`, JSON.stringify(result));
          } catch (_) {
          }
        }
        populateUserData(username, result, false);
      };
    };
    const cleanCache = () => {
      const todayKeyPrefix = `mountaineers_cancellations_${getLocalDateString()}_`;
      const prefix = "mountaineers_cancellations_";
      Object.keys(window.localStorage).forEach((key) => {
        if (key.startsWith(prefix) && !key.startsWith(todayKeyPrefix)) {
          window.localStorage.removeItem(key);
        }
      });
    };
    const injectStyles = async () => {
      addStyleFromUrl("https://unpkg.com/microtip/microtip.css");
      addStyle(`
            [aria-label][data-microtip-size]::after {
                white-space: pre-wrap; // allow multiline tooltips
            }
        `);
    };
    const addStyle = (css) => {
      window.$("<style>").prop("type", "text/css").html(css).appendTo("head");
    };
    const addStyleFromUrl = (url) => {
      window.$("<link>").appendTo("head").attr({
        type: "text/css",
        rel: "stylesheet",
        href: url
      });
    };
    const getLocalDateString = () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const populateUserData = (username, result, fromCache) => {
      const statsDivSelector = `.mountaineers-cancellations-stats[mountaineers-username="${username}"]`;
      const $statsDiv = $(statsDivSelector);
      if (!$statsDiv.length) return;
      if (result.error) {
        $statsDiv.html(toHtmlList([result.error]));
        return;
      }
      const formatStat = (stat) => {
        const pct = stat.total > 0 ? Math.round((stat.canceled + stat.noShow) / stat.total * 100) : 0;
        return `${stat.canceled}-${stat.noShow} out of ${stat.total} trip${stat.total !== 1 ? "s" : ""} (${pct}%)`;
      };
      const data = [
        `30d: ${formatStat(result.stats.stats30)}`,
        `90d: ${formatStat(result.stats.stats90)}`,
        `1y: ${formatStat(result.stats.stats365)}`,
        `${result.participationNotes.length} participation note${result.participationNotes.length !== 1 ? "s" : ""} in last year`
      ];
      let tooltip = "";
      if (result.participationNotes.length) {
        tooltip += `Participation Notes:
${result.participationNotes.join("\n")}

`;
      }
      const dateStr = new Date(result.calculatedAt).toLocaleString();
      tooltip += `Calculated: ${dateStr}
From cache: ${fromCache}`;
      $statsDiv.html(toHtmlList(data)).attr("aria-label", tooltip).attr("data-microtip-position", "top").attr("data-microtip-size", "large").attr("role", "tooltip");
    };
    const processQueue = () => {
      while (tasksQueue.length > 0) {
        const username = tasksQueue.shift();
        const localDate = getLocalDateString();
        const cached = window.localStorage.getItem(`mountaineers_cancellations_${localDate}_${username}`);
        if (cached) {
          populateUserData(username, JSON.parse(cached), true);
        } else {
          userDataWorker.postMessage(username);
        }
      }
    };
    const processRosterTab = () => {
      if (!$('div[data-tab="roster-tab"]').length) return;
      initPage();
      const originalOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
      };
      const originalSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = function() {
        if (this._url && this._url.endsWith("/roster-tab")) {
          this.addEventListener("load", () => {
            setTimeout(processRosterContacts, 500);
          });
        }
        return originalSend.apply(this, arguments);
      };
    };
    const processRosterContacts = () => {
      const $contacts = $('div[data-tab="roster-tab"] .roster-contact');
      if ($contacts.length > 12) return;
      $contacts.each((_, node) => processRosterContact($(node)));
    };
    const processRosterContact = ($element) => {
      if ($element.find(".mountaineers-cancellations").length) return;
      const $link = $element.find('a[href*="/members/"]');
      if (!$link.length) return;
      const href = $link.attr("href");
      const match = href.match(/\/members\/([^/?#]+)/);
      if (!match || !match[1]) return;
      const username = match[1];
      const $htmlContent = `
            <div class="mountaineers-cancellations" style="clear:left; padding:10px 0; font-size:90%; font-weight:normal;">
                <strong>Cancellations and No Shows for Trips</strong>
                <div class="mountaineers-cancellations-stats" mountaineers-username="${username}">
                    ${toHtmlList(["Loading..."])}
                </div>
            </div>
        `;
      $element.append($htmlContent);
      tasksQueue.push(username);
    };
    const processProfilePage = () => {
      const profileMatch = window.location.pathname.match(/^\/members\/([^/]+)\/?$/);
      if (!profileMatch || !profileMatch[1]) return;
      const username = profileMatch[1];
      const $profileDetails = $(".profile-details");
      if (!$profileDetails.length) return;
      if ($(".mountaineers-cancellations").length) return;
      initPage();
      const $htmlContent = `
            <div class="mountaineers-cancellations">
                <h6>Cancellations and No Shows for Trips</h6>
                <div class="mountaineers-cancellations-stats" mountaineers-username="${username}">
                    ${toHtmlList(["Loading..."])}
                </div>
            </div>
        `;
      $profileDetails.before($htmlContent);
      tasksQueue.push(username);
    };
    const toHtmlList = (items) => {
      return `
            <ul>
                ${items.map((item) => `<li style="background:none;padding:0">${item}</li>`).join("")}
            </ul>
        `;
    };
    if (!isLeader()) return;
    processProfilePage();
    processRosterTab();
  };
  const workerRaw = `const parseParticipationNotes = (html) => {
    const participationNotes = [];
    const rowRegex = /<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi;
    const oneYearAgo = new Date(new Date().getTime() - (365 * 24 * 60 * 60 * 1000));

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];
        const cellRegex = /<td[^>]*>([\\s\\S]*?)<\\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            cells.push(cellMatch[1]);
        }
        
        if (cells.length === 6) {
            const rawDate = cells[0].replace(/<[^>]*>/g, '').trim();
            const firstDate = rawDate.split(' - ')[0]; // date might be a range
            const activityDate = new Date(firstDate);

            if (activityDate < oneYearAgo) {
                break; // Sorted descending, so we can stop
            }

            const note = cells[5].replace(/<[^>]*>/g, '').trim();
            if (note) {
                const title = cells[1].replace(/<[^>]*>/g, '').trim();
                participationNotes.push(rawDate + ' - ' + title + ': ' + note);
            }
        }
    }
    return participationNotes;
};

const calculateStats = (activities) => {
    const validActivities = activities.filter(a => 
        a.category === 'trip' && 
        a.trip_results !== 'Canceled' && 
        a.result !== 'Waitlisted'
    );

    const getPeriodStats = (days) => {
        const cutoff = new Date(new Date().getTime() - (days * 24 * 60 * 60 * 1000));
        const periodActivities = validActivities.filter(a => {
            const date = new Date(a.start);
            return date >= cutoff;
        });
        
        const total = periodActivities.length;
        const canceled = periodActivities.filter(a => a.result === 'Canceled').length;
        const noShow = periodActivities.filter(a => a.result === 'No Show').length;
        
        return { canceled: canceled, noShow: noShow, total: total };
    };

    return { stats30: getPeriodStats(30), stats90: getPeriodStats(90), stats365: getPeriodStats(365) };
};

self.onmessage = async (e) => {
    const username = e.data;
    const historyUrl = 'https://www.mountaineers.org/members/' + username + '/member-activity-history.json';
    const reviewsUrl = 'https://www.mountaineers.org/members/' + username + '/review-activities';
    
    try {
        const [historyResponse, reviewsResponse] = await Promise.all([fetch(historyUrl), fetch(reviewsUrl)]);

        const failedResponses = [historyResponse, reviewsResponse].filter(r => !r.ok);
        if (failedResponses.length) {
            const error = failedResponses.map(r => r.url + ": " + r.status + " " + r.statusText).join(', ');
            throw new Error("Failed to fetch data: " + error);
        }

        const result = {
            stats: calculateStats(await historyResponse.json()),
            participationNotes: parseParticipationNotes(await reviewsResponse.text()),
            calculatedAt: new Date().toISOString()
        };
        self.postMessage({ username: username, result: result });
        
    } catch (err) {
        self.postMessage({ username: username, result: { error: err.message } });
    }
};
`;
  (() => {
    const window = unsafeWindow;
    const start = () => {
      run(window, URL.createObjectURL(new Blob([workerRaw], { type: "application/javascript" })));
    };
    if (window.document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start);
    }
  })();

})();