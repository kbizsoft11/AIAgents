(async () => {
    try {

        const userInfo = await chrome.identity.getProfileUserInfo({
            accountStatus: 'ANY'
        });

        if (!userInfo?.email) {
            return;
        }

        const response = await fetch(
            `https://extensions.kbizsoft.com/magicaa-extension/check_user.php?email=${encodeURIComponent(userInfo.email)}`
        );

        const data = await response.json();

        if (
            data.success === true &&
            data.status === 'active'
        ) {

            window.location.replace(
                chrome.runtime.getURL('dashboard/dashboard.html')
            );

        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
})();