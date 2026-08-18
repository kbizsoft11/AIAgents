(async () => {

    const userInfo =
        await chrome.identity.getProfileUserInfo();

    if (!userInfo.email) {
        location.replace(
            chrome.runtime.getURL(
                "dashboard/blocked.html"
            )
        );
        return;
    }

    const response = await fetch(
        `https://extensions.kbizsoft.com/magicaa-extension/check_user.php?email=${encodeURIComponent(userInfo.email)}`
    );

    const data = await response.json();

    if (
        !data.success ||
        data.status !== "active"
    ) {
        location.replace(
            chrome.runtime.getURL(
                "dashboard/blocked.html"
            )
        );
        return;
    }

})();