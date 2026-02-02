(() => {
    const firebaseConfig = {
        apiKey: "AIzaSyCcxotG6DNpkUxTXplC4DURNe-S02otuc4",
        authDomain: "samdcoin-e65a5.firebaseapp.com",
        databaseURL: "https://samdcoin-e65a5-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "samdcoin-e65a5",
        storageBucket: "samdcoin-e65a5.firebasestorage.app",
        messagingSenderId: "30873122562",
        appId: "1:30873122562:web:5243417cc6ebc5abe4341b",
        measurementId: "G-BBPFLK9DMS"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const tg = window.Telegram.WebApp;
    tg.expand();
    
    let user = null;
    let USER_ID = 'demo-user';
    let USERNAME = 'user';
    let FIRST_NAME = 'Гость';
    
    try {
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            user = tg.initDataUnsafe.user;
            USER_ID = user.id ? user.id.toString() : 'demo-user';
            USERNAME = user.username || 'user';
            FIRST_NAME = user.first_name || 'Гость';
        }
    } catch (error) {
        console.error('Error loading Telegram data:', error);
    }

    let userData = {
        samd: 0,
        tickets: 0,
        currentMining: 0,
        maxMining: 500,
        incomePerSecond: 0.1,
        lastMiningUpdate: Date.now(),
        isMining: false,
        upgrades: [],
        nfts: [],
        activatedPromocodes: []
    };

    let shopItems = [];
    let nftItems = [];
    let cases = [];
    let promocodes = [];
    let tradeRequests = [];
    let lastSave = Date.now();
    let currentInventoryFilter = 'common';

    let selectedNFT = null;
    let selectedCase = null;
    let selectedTradeUser = null;
    let tradeSelection = {
        myNFTs: [],
        mySAMD: 0,
        myTickets: 0,
        theirNFTs: [],
        theirSAMD: 0,
        theirTickets: 0
    };
    
    let userListener = null;
    let shopListener = null;
    let nftListener = null;
    let casesListener = null;
    let promocodesListener = null;
    let tradesListener = null;

    let isTransactionInProgress = false;
    let activeTransactions = new Map();

    function startTransaction(id) {
        if (activeTransactions.has(id) && activeTransactions.get(id) === 'in_progress') {
            return false;
        }
        activeTransactions.set(id, 'in_progress');
        isTransactionInProgress = true;
        return true;
    }

    function endTransaction(id) {
        activeTransactions.set(id, 'completed');
        setTimeout(() => {
            activeTransactions.delete(id);
            isTransactionInProgress = activeTransactions.size > 0;
        }, 1000);
    }

    function lockButton(button) {
        if (!button) return null;
        const originalHTML = button.innerHTML;
        button.classList.add('btn-loading');
        button.disabled = true;
        return originalHTML;
    }

    function unlockButton(button, originalHTML) {
        if (!button) return;
        button.classList.remove('btn-loading');
        button.disabled = false;
        if (originalHTML) {
            button.innerHTML = originalHTML;
        }
    }

    async function loadUserData() {
        try {
            const progressText = document.getElementById('progressText');
            progressText.textContent = 'Проверка пользователя...';
            const userDoc = await db.collection('users').doc(USER_ID).get();
            
            if (userDoc.exists) {
                progressText.textContent = 'Загрузка данных...';
                const data = userDoc.data();
                userData = {
                    samd: data.samd || 0,
                    tickets: data.tickets || 0,
                    currentMining: data.currentMining || 0,
                    maxMining: data.maxMining || 500,
                    incomePerSecond: data.incomePerSecond || 0.1,
                    lastMiningUpdate: data.lastMiningUpdate || Date.now(),
                    isMining: data.isMining || false,
                    upgrades: data.upgrades || [],
                    nfts: data.nfts || [],
                    activatedPromocodes: data.activatedPromocodes || []
                };
                await calculateOfflineMining();
            } else {
                progressText.textContent = 'Создание нового пользователя...';
                const safeUserData = {
                    samd: 0,
                    tickets: 0,
                    currentMining: 0,
                    maxMining: 500,
                    incomePerSecond: 0.1,
                    lastMiningUpdate: Date.now(),
                    isMining: false,
                    upgrades: [],
                    nfts: [],
                    activatedPromocodes: [],
                    telegramId: USER_ID,
                    username: USERNAME,
                    firstName: FIRST_NAME,
                    lastActive: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: Date.now()
                };
                if (user) {
                    safeUserData.telegramData = {
                        id: user.id,
                        username: user.username,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        language_code: user.language_code
                    };
                }
                await db.collection('users').doc(USER_ID).set(safeUserData);
                userData = safeUserData;
            }
            
            updateUI();
            updateMiningStatus();
            progressText.textContent = 'Загрузка магазина...';
            await loadShopItems();
            progressText.textContent = 'Загрузка NFT...';
            await loadNFTItems();
            progressText.textContent = 'Загрузка кейсов...';
            await loadCases();
            progressText.textContent = 'Загрузка промокодов...';
            await loadPromocodes();
            progressText.textContent = 'Загрузка трейдов...';
            await loadTradeRequests();
            progressText.textContent = 'Настройка обновлений...';
            setupRealtimeListeners();
            showOfflineEarnings();
            
            // Скрываем экран загрузки
            setTimeout(() => {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
            }, 500);
            
            return true;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            showNotification('Ошибка загрузки данных', true);
            
            // Все равно скрываем экран загрузки при ошибке
            setTimeout(() => {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
            }, 500);
            
            return false;
        }
    }

    async function loadShopItems() {
        try {
            const snapshot = await db.collection('shopItems').get();
            shopItems = [];
            snapshot.forEach(doc => {
                shopItems.push({ id: doc.id, ...doc.data() });
            });
            updateShopUI();
        } catch (error) {
            console.error('Ошибка загрузки магазина:', error);
        }
    }

    async function loadNFTItems() {
        try {
            const snapshot = await db.collection('nftItems').get();
            nftItems = [];
            snapshot.forEach(doc => {
                nftItems.push({ id: doc.id, ...doc.data() });
            });
            updateNFTUI();
        } catch (error) {
            console.error('Ошибка загрузки NFT:', error);
        }
    }

    async function loadCases() {
        try {
            const snapshot = await db.collection('cases').get();
            cases = [];
            snapshot.forEach(doc => {
                cases.push({ id: doc.id, ...doc.data() });
            });
            updateCasesUI();
        } catch (error) {
            console.error('Ошибка загрузки кейсов:', error);
        }
    }

    async function loadPromocodes() {
        try {
            const snapshot = await db.collection('promocodes').get();
            promocodes = [];
            snapshot.forEach(doc => {
                promocodes.push({ id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error('Ошибка загрузки промокодов:', error);
        }
    }

    async function loadTradeRequests() {
        try {
            const snapshot = await db.collection('tradeRequests')
                .where('status', '==', 'pending')
                .get();
            tradeRequests = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.fromUserId === USER_ID || data.toUserId === USER_ID) {
                    tradeRequests.push({ id: doc.id, ...data });
                }
            });
            updateTradeUI();
        } catch (error) {
            console.error('Ошибка загрузки трейдов:', error);
        }
    }

    async function calculateOfflineMining() {
        try {
            const lastUpdate = userData.lastMiningUpdate || Date.now();
            const now = Date.now();
            const diffSeconds = (now - lastUpdate) / 1000;
            if (diffSeconds > 0 && userData.isMining) {
                const mined = diffSeconds * userData.incomePerSecond;
                const newMining = userData.currentMining + mined;
                if (newMining >= userData.maxMining) {
                    userData.currentMining = userData.maxMining;
                    userData.isMining = false;
                } else {
                    userData.currentMining = newMining;
                }
                userData.lastMiningUpdate = now;
                await saveUserData();
                return mined;
            }
            return 0;
        } catch (error) {
            console.error('Ошибка расчета оффлайн майнинга:', error);
            return 0;
        }
    }

    function showOfflineEarnings() {
        const lastUpdate = userData.lastMiningUpdate || Date.now();
        const now = Date.now();
        const diffSeconds = (now - lastUpdate) / 1000;
        if (diffSeconds > 60 && userData.isMining) {
            const mined = diffSeconds * userData.incomePerSecond;
            if (mined > 0.1) {
                const message = `Пока вас не было намайнено: ${mined.toFixed(1)} SAMD`;
                setTimeout(() => showNotification(message, false, true), 1000);
            }
        }
    }

    async function saveUserData() {
        try {
            userData.lastMiningUpdate = Date.now();
            const safeData = {
                samd: userData.samd || 0,
                tickets: userData.tickets || 0,
                currentMining: userData.currentMining || 0,
                maxMining: userData.maxMining || 500,
                incomePerSecond: userData.incomePerSecond || 0.1,
                lastMiningUpdate: userData.lastMiningUpdate,
                isMining: userData.isMining || false,
                upgrades: userData.upgrades || [],
                nfts: userData.nfts || [],
                activatedPromocodes: userData.activatedPromocodes || [],
                telegramId: USER_ID,
                username: USERNAME,
                firstName: FIRST_NAME,
                lastActive: new Date().toISOString(),
                updatedAt: Date.now()
            };
            if (user) {
                safeData.telegramData = {
                    id: user.id,
                    username: user.username,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    language_code: user.language_code
                };
            }
            await db.collection('users').doc(USER_ID).set(safeData, { merge: true });
            return true;
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            return false;
        }
    }

    function setupRealtimeListeners() {
        if (userListener) userListener();
        userListener = db.collection('users').doc(USER_ID)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.samd !== undefined) userData.samd = data.samd;
                    if (data.tickets !== undefined) userData.tickets = data.tickets;
                    if (data.currentMining !== undefined) userData.currentMining = data.currentMining;
                    if (data.isMining !== undefined) userData.isMining = data.isMining;
                    if (data.maxMining !== undefined) userData.maxMining = data.maxMining;
                    if (data.incomePerSecond !== undefined) userData.incomePerSecond = data.incomePerSecond;
                    if (data.nfts) userData.nfts = data.nfts;
                    if (data.activatedPromocodes) userData.activatedPromocodes = data.activatedPromocodes;
                    updateUI();
                    updateMiningStatus();
                    updateInventoryStats();
                    
                    // Обновляем доступные NFT в трейде
                    if (selectedTradeUser) {
                        updateMyNFTsSelection();
                    }
                }
            });

        if (shopListener) shopListener();
        shopListener = db.collection('shopItems')
            .onSnapshot((snapshot) => {
                shopItems = [];
                snapshot.forEach(doc => {
                    shopItems.push({ id: doc.id, ...doc.data() });
                });
                updateShopUI();
            });

        if (nftListener) nftListener();
        nftListener = db.collection('nftItems')
            .onSnapshot((snapshot) => {
                nftItems = [];
                snapshot.forEach(doc => {
                    nftItems.push({ id: doc.id, ...doc.data() });
                });
                updateNFTUI();
            });

        if (casesListener) casesListener();
        casesListener = db.collection('cases')
            .onSnapshot((snapshot) => {
                cases = [];
                snapshot.forEach(doc => {
                    cases.push({ id: doc.id, ...doc.data() });
                });
                updateCasesUI();
            });

        if (promocodesListener) promocodesListener();
        promocodesListener = db.collection('promocodes')
            .onSnapshot((snapshot) => {
                promocodes = [];
                snapshot.forEach(doc => {
                    promocodes.push({ id: doc.id, ...doc.data() });
                });
            });

        if (tradesListener) tradesListener();
        tradesListener = db.collection('tradeRequests')
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                tradeRequests = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.fromUserId === USER_ID || data.toUserId === USER_ID) {
                        tradeRequests.push({ id: doc.id, ...data });
                    }
                });
                updateTradeUI();
            });
    }

    function updateMiningStatus() {
        const mineBtn = document.getElementById('mineBtn');
        if (!mineBtn) return;
        if (userData.isMining && userData.currentMining < userData.maxMining) {
            mineBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Майнинг...';
            mineBtn.className = 'mine-btn mining';
            mineBtn.disabled = false;
        } else if (userData.currentMining >= userData.maxMining) {
            mineBtn.innerHTML = '<i class="fas fa-coins"></i> Забрать SAMD';
            mineBtn.className = 'mine-btn collect';
            mineBtn.disabled = false;
        } else {
            mineBtn.innerHTML = '<i class="fas fa-digging"></i> Майнить SAMD';
            mineBtn.className = 'mine-btn';
            mineBtn.disabled = false;
        }
    }

    function startMining() {
        if (userData.currentMining >= userData.maxMining) {
            collectMining();
            return;
        }
        userData.isMining = true;
        userData.lastMiningUpdate = Date.now();
        updateMiningStatus();
        saveUserData();
        showNotification('Майнинг начат! Начинаем добывать SAMD...');
    }

    function collectMining() {
        if (userData.currentMining > 0) {
            const collected = userData.currentMining;
            userData.samd += collected;
            userData.currentMining = 0;
            userData.isMining = false;
            updateUI();
            showNotification(`Собрано: ${collected.toFixed(1)} SAMD`);
            saveUserData();
        } else {
            showNotification('Нечего собирать!', true);
        }
    }

    function handleMiningClick() {
        if (userData.currentMining >= userData.maxMining) {
            collectMining();
        } else if (!userData.isMining) {
            startMining();
        } else {
            showNotification('Майнинг уже идет!', false, true);
        }
    }

    // Привязываем обработчик майнинга
    document.addEventListener('DOMContentLoaded', function() {
        const mineBtn = document.getElementById('mineBtn');
        if (mineBtn) {
            mineBtn.addEventListener('click', handleMiningClick);
        }
    });

    async function buyNFTItem(nftId) {
        const transactionId = `nft_${nftId}_${Date.now()}`;
        if (activeTransactions.has(transactionId) && activeTransactions.get(transactionId) === 'in_progress') {
            showNotification('Операция уже выполняется', true);
            return;
        }
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        const nft = nftItems.find(i => i.id === nftId);
        if (!nft) {
            showNotification('NFT не найдено', true);
            endTransaction(transactionId);
            return;
        }
        if (userData.samd < nft.price) {
            showNotification('Недостаточно SAMD', true);
            endTransaction(transactionId);
            return;
        }
        if ((nft.currentStock || 0) <= 0) {
            showNotification('NFT закончилось', true);
            endTransaction(transactionId);
            return;
        }
        const buyBtn = document.querySelector(`[onclick*="buyNFTItem('${nftId}')"]`);
        const originalHTML = lockButton(buyBtn);
        try {
            const nftRef = db.collection('nftItems').doc(nftId);
            const userRef = db.collection('users').doc(USER_ID);
            await db.runTransaction(async (transaction) => {
                const nftDoc = await transaction.get(nftRef);
                const userDoc = await transaction.get(userRef);
                if (!nftDoc.exists || !userDoc.exists) throw new Error("Документ не найден");
                const nftData = nftDoc.data();
                const userDataInTrans = userDoc.data();
                if (nftData.currentStock <= 0) throw new Error("NFT закончилось");
                if (userDataInTrans.samd < nft.price) throw new Error("Недостаточно SAMD");
                transaction.update(nftRef, { currentStock: firebase.firestore.FieldValue.increment(-1) });
                transaction.update(userRef, { samd: firebase.firestore.FieldValue.increment(-nft.price) });
                const newNFTs = [...(userDataInTrans.nfts || []), {
                    nftId: `${nftId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    name: nft.name,
                    imageUrl: nft.imageUrl || '',
                    rarity: nft.rarity || 'common',
                    basePrice: nft.price,
                    purchasedAt: new Date().toISOString(),
                    source: 'marketplace',
                    createdAt: Date.now()
                }];
                transaction.update(userRef, { nfts: newNFTs });
                return { success: true, nftName: nft.name, price: nft.price };
            });
            userData.samd -= nft.price;
            userData.nfts.push({
                nftId: `${nftId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                name: nft.name,
                imageUrl: nft.imageUrl || '',
                rarity: nft.rarity || 'common',
                basePrice: nft.price,
                purchasedAt: new Date().toISOString(),
                source: 'marketplace',
                createdAt: Date.now()
            });
            updateUI();
            showNotification(`✅ Куплено NFT: ${nft.name} за ${nft.price} SAMD`);
            setTimeout(() => { updateNFTUI(); }, 1000);
        } catch (error) {
            console.error('Ошибка покупки NFT:', error);
            if (error.message.includes("NFT закончилось")) {
                showNotification('NFT закончилось!', true);
                updateNFTUI();
            } else if (error.message.includes("Недостаточно SAMD")) {
                showNotification('Недостаточно SAMD', true);
            } else {
                showNotification('Ошибка покупки NFT', true);
            }
        } finally {
            unlockButton(buyBtn, originalHTML);
            endTransaction(transactionId);
        }
    }

    async function buyShopItem(itemId) {
        const transactionId = `shop_${itemId}_${Date.now()}`;
        if (activeTransactions.has(transactionId) && activeTransactions.get(transactionId) === 'in_progress') {
            showNotification('Операция уже выполняется', true);
            return;
        }
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        const item = shopItems.find(i => i.id === itemId);
        if (!item) {
            showNotification('Товар не найден', true);
            endTransaction(transactionId);
            return;
        }
        if (userData.samd < item.price) {
            showNotification('Недостаточно SAMD', true);
            endTransaction(transactionId);
            return;
        }
        if ((item.currentStock || 0) <= 0) {
            showNotification('Товар закончился', true);
            endTransaction(transactionId);
            return;
        }
        const buyBtn = document.querySelector(`[onclick*="window.bshi('${itemId}')"]`);
        const originalHTML = lockButton(buyBtn);
        try {
            const itemRef = db.collection('shopItems').doc(itemId);
            const userRef = db.collection('users').doc(USER_ID);
            await db.runTransaction(async (transaction) => {
                const itemDoc = await transaction.get(itemRef);
                const userDoc = await transaction.get(userRef);
                if (!itemDoc.exists || !userDoc.exists) throw new Error("Документ не найден");
                const itemData = itemDoc.data();
                const userDataInTrans = userDoc.data();
                if (itemData.currentStock <= 0) throw new Error("Товар закончился");
                if (userDataInTrans.samd < item.price) throw new Error("Недостаточно SAMD");
                transaction.update(itemRef, { currentStock: firebase.firestore.FieldValue.increment(-1) });
                transaction.update(userRef, { samd: firebase.firestore.FieldValue.increment(-item.price) });
                if (item.type === 'income') {
                    transaction.update(userRef, { incomePerSecond: firebase.firestore.FieldValue.increment(item.value) });
                } else if (item.type === 'max') {
                    transaction.update(userRef, { maxMining: firebase.firestore.FieldValue.increment(item.value) });
                } else if (item.type === 'tickets') {
                    transaction.update(userRef, { tickets: firebase.firestore.FieldValue.increment(item.value) });
                }
                return true;
            });
            userData.samd -= item.price;
            if (item.type === 'income') userData.incomePerSecond += item.value;
            else if (item.type === 'max') userData.maxMining += item.value;
            else if (item.type === 'tickets') userData.tickets += item.value;
            updateUI();
            showNotification(`✅ Куплено: ${item.name}`);
            setTimeout(() => { updateShopUI(); }, 1000);
        } catch (error) {
            console.error('Ошибка покупки:', error);
            if (error.message.includes("Товар закончился")) {
                showNotification('Товар закончился!', true);
                updateShopUI();
            } else if (error.message.includes("Недостаточно SAMD")) {
                showNotification('Недостаточно SAMD', true);
            } else {
                showNotification('Ошибка покупки', true);
            }
        } finally {
            unlockButton(buyBtn, originalHTML);
            endTransaction(transactionId);
        }
    }
    window.bshi = buyShopItem;

    async function sellNFT(nftId) {
        const transactionId = `sell_${nftId}_${Date.now()}`;
        if (activeTransactions.has(transactionId) && activeTransactions.get(transactionId) === 'in_progress') {
            showNotification('Операция уже выполняется', true);
            return;
        }
        const nftIndex = userData.nfts.findIndex(nft => nft.nftId === nftId);
        if (nftIndex === -1) {
            showNotification('NFT не найдено в вашем инвентаре', true);
            return;
        }
        const nft = userData.nfts[nftIndex];
        if (nft.nonSellable) {
            showNotification('Это NFT нельзя продать', true);
            return;
        }
        const basePrice = nft.basePrice || nft.price || 100;
        const sellPrice = Math.floor(basePrice * 0.7);
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        try {
            const userRef = db.collection('users').doc(USER_ID);
            await db.runTransaction(async (transaction) => {
                const userSnapshot = await transaction.get(userRef);
                if (!userSnapshot.exists) throw new Error("Пользователь не найден");
                const userDataInTrans = userSnapshot.data();
                const currentNFTs = userDataInTrans.nfts || [];
                const nftToSellIndex = currentNFTs.findIndex(item => item.nftId === nftId);
                if (nftToSellIndex === -1) throw new Error("NFT не найдено");
                currentNFTs.splice(nftToSellIndex, 1);
                transaction.update(userRef, {
                    samd: firebase.firestore.FieldValue.increment(sellPrice),
                    nfts: currentNFTs
                });
                return true;
            });
            userData.samd += sellPrice;
            userData.nfts.splice(nftIndex, 1);
            updateUI();
            updateInventoryUI();
            showNotification(`💰 NFT "${nft.name}" продано за ${sellPrice} SAMD`);
        } catch (error) {
            console.error('Ошибка продажи NFT:', error);
            showNotification('Ошибка продажи NFT', true);
        } finally {
            endTransaction(transactionId);
        }
    }

    async function openCase(caseId) {
        const transactionId = `case_${caseId}_${Date.now()}`;
        if (activeTransactions.has(transactionId) && activeTransactions.get(transactionId) === 'in_progress') {
            showNotification('Операция уже выполняется', true);
            return;
        }
        const caseItem = cases.find(c => c.id === caseId);
        if (!caseItem) {
            showNotification('Кейс не найден', true);
            return;
        }
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        try {
            if (userData.tickets < caseItem.cost) {
                showNotification('Недостаточно билетов!', true);
                endTransaction(transactionId);
                return;
            }
            const rewards = caseItem.rewards || [];
            if (rewards.length === 0) {
                showNotification('В кейсе нет наград', true);
                endTransaction(transactionId);
                return;
            }
            const totalWeight = rewards.reduce((sum, reward) => sum + (reward.weight || 1), 0);
            let random = Math.random() * totalWeight;
            let selectedReward = null;
            for (const reward of rewards) {
                random -= (reward.weight || 1);
                if (random <= 0) {
                    selectedReward = reward;
                    break;
                }
            }
            if (!selectedReward) selectedReward = rewards[0];
            const userRef = db.collection('users').doc(USER_ID);
            await db.runTransaction(async (transaction) => {
                const userSnapshot = await transaction.get(userRef);
                if (!userSnapshot.exists) throw new Error("Пользователь не найден");
                const userDataInTrans = userSnapshot.data();
                if (userDataInTrans.tickets < caseItem.cost) throw new Error("Недостаточно билетов");
                transaction.update(userRef, { tickets: firebase.firestore.FieldValue.increment(-caseItem.cost) });
                const newNFTs = [...(userDataInTrans.nfts || []), {
                    nftId: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: selectedReward.name,
                    imageUrl: selectedReward.imageUrl || '',
                    rarity: selectedReward.rarity || 'common',
                    basePrice: selectedReward.price || (selectedReward.rarity === 'legendary' ? 5000 : 
                                                      selectedReward.rarity === 'epic' ? 2500 :
                                                      selectedReward.rarity === 'rare' ? 1000 : 500),
                    fromCase: caseItem.name,
                    receivedAt: new Date().toISOString(),
                    createdAt: Date.now()
                }];
                transaction.update(userRef, { nfts: newNFTs });
                return selectedReward;
            });
            userData.tickets -= caseItem.cost;
            userData.nfts.push({
                nftId: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: selectedReward.name,
                imageUrl: selectedReward.imageUrl || '',
                rarity: selectedReward.rarity || 'common',
                basePrice: selectedReward.price || (selectedReward.rarity === 'legendary' ? 5000 : 
                                                  selectedReward.rarity === 'epic' ? 2500 :
                                                  selectedReward.rarity === 'rare' ? 1000 : 500),
                fromCase: caseItem.name,
                receivedAt: new Date().toISOString(),
                createdAt: Date.now()
            });
            updateUI();
            showCaseReward(selectedReward);
        } catch (error) {
            console.error('Ошибка открытия кейса:', error);
            if (error.message === "Недостаточно билетов") {
                showNotification('Недостаточно билетов!', true);
            } else {
                showNotification('Ошибка открытия кейса', true);
            }
        } finally {
            endTransaction(transactionId);
        }
    }

    async function activatePromocode(promocode) {
        const transactionId = `promo_${promocode}_${Date.now()}`;
        if (activeTransactions.has(transactionId) && activeTransactions.get(transactionId) === 'in_progress') {
            showNotification('Операция уже выполняется', true);
            return;
        }
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        const promoInput = document.getElementById('profilePromocodeInput');
        const promoBtn = document.getElementById('profilePromocodeBtn');
        const originalHTML = lockButton(promoBtn);
        try {
            const promocodeUpper = promocode.trim().toUpperCase();
            if (!promocodeUpper) {
                showNotification('Введите промокод', true);
                endTransaction(transactionId);
                unlockButton(promoBtn, originalHTML);
                return;
            }
            if (userData.activatedPromocodes && userData.activatedPromocodes.includes(promocodeUpper)) {
                showNotification('Вы уже активировали этот промокод', true);
                endTransaction(transactionId);
                unlockButton(promoBtn, originalHTML);
                return;
            }
            const promocodesSnapshot = await db.collection('promocodes')
                .where('code', '==', promocodeUpper)
                .get();
            if (promocodesSnapshot.empty) {
                showNotification('Промокод не найден', true);
                endTransaction(transactionId);
                unlockButton(promoBtn, originalHTML);
                return;
            }
            const promoDoc = promocodesSnapshot.docs[0];
            const promoData = promoDoc.data();
            if (!promoData.isActive) {
                showNotification('Промокод не активен', true);
                endTransaction(transactionId);
                unlockButton(promoBtn, originalHTML);
                return;
            }
            if (promoData.expiresAt) {
                const expiresAt = new Date(promoData.expiresAt);
                if (expiresAt < new Date()) {
                    showNotification('Промокод истек', true);
                    endTransaction(transactionId);
                    unlockButton(promoBtn, originalHTML);
                    return;
                }
            }
            const currentActivations = promoData.currentActivations || 0;
            if (promoData.maxActivations > 0 && currentActivations >= promoData.maxActivations) {
                showNotification('Промокод уже использован максимальное количество раз', true);
                endTransaction(transactionId);
                unlockButton(promoBtn, originalHTML);
                return;
            }
            const userRef = db.collection('users').doc(USER_ID);
            const promoRef = db.collection('promocodes').doc(promoDoc.id);
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                const promoDocTrans = await transaction.get(promoRef);
                if (!userDoc.exists || !promoDocTrans.exists) throw new Error("Документ не найден");
                const userDataInTrans = userDoc.data();
                const promoDataInTrans = promoDocTrans.data();
                if (promoDataInTrans.maxActivations > 0 && 
                    promoDataInTrans.currentActivations >= promoDataInTrans.maxActivations) {
                    throw new Error("Промокод уже использован максимальное количество раз");
                }
                const activatedPromos = userDataInTrans.activatedPromocodes || [];
                if (activatedPromos.includes(promocodeUpper)) {
                    throw new Error("Вы уже активировали этот промокод");
                }
                const rewards = promoDataInTrans.rewards || {};
                let updates = {};
                if (rewards.samd) {
                    updates.samd = firebase.firestore.FieldValue.increment(rewards.samd);
                    userData.samd += rewards.samd;
                }
                if (rewards.tickets) {
                    updates.tickets = firebase.firestore.FieldValue.increment(rewards.tickets);
                    userData.tickets += rewards.tickets;
                }
                if (rewards.incomePerSecond) {
                    updates.incomePerSecond = firebase.firestore.FieldValue.increment(rewards.incomePerSecond);
                    userData.incomePerSecond += rewards.incomePerSecond;
                }
                if (rewards.maxMining) {
                    updates.maxMining = firebase.firestore.FieldValue.increment(rewards.maxMining);
                    userData.maxMining += rewards.maxMining;
                }
                if (rewards.nft) {
                    const currentNFTs = userDataInTrans.nfts || [];
                    const nftReward = rewards.nft;
                    const newNFT = {
                        nftId: `promo_${promocodeUpper}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                        name: nftReward.name || 'NFT из промокода',
                        imageUrl: nftReward.imageUrl || '',
                        rarity: nftReward.rarity || 'common',
                        basePrice: nftReward.price || 100,
                        fromPromocode: promocodeUpper,
                        receivedAt: new Date().toISOString(),
                        createdAt: Date.now()
                    };
                    currentNFTs.push(newNFT);
                    updates.nfts = currentNFTs;
                    userData.nfts.push(newNFT);
                }
                updates.activatedPromocodes = firebase.firestore.FieldValue.arrayUnion(promocodeUpper);
                userData.activatedPromocodes = [...(userData.activatedPromocodes || []), promocodeUpper];
                transaction.update(userRef, updates);
                transaction.update(promoRef, {
                    currentActivations: firebase.firestore.FieldValue.increment(1),
                    activatedBy: firebase.firestore.FieldValue.arrayUnion(USER_ID),
                    lastActivatedAt: new Date().toISOString()
                });
                return { rewards, promoName: promoDataInTrans.name };
            });
            if (promoInput) promoInput.value = '';
            updateUI();
            updateInventoryUI();
            showNotification(`🎉 Промокод "${promocodeUpper}" активирован успешно!`);
            const rewardDetails = [];
            if (promoData.rewards.samd) rewardDetails.push(`${promoData.rewards.samd} SAMD`);
            if (promoData.rewards.tickets) rewardDetails.push(`${promoData.rewards.tickets} билетов`);
            if (promoData.rewards.incomePerSecond) rewardDetails.push(`+${promoData.rewards.incomePerSecond} SAMD/сек`);
            if (promoData.rewards.maxMining) rewardDetails.push(`+${promoData.rewards.maxMining} макс. SAMD`);
            if (promoData.rewards.nft) rewardDetails.push(`NFT: ${promoData.rewards.nft.name}`);
            if (rewardDetails.length > 0) {
                setTimeout(() => {
                    showNotification(`Получено: ${rewardDetails.join(', ')}`);
                }, 1500);
            }
        } catch (error) {
            console.error('Ошибка активации промокода:', error);
            if (error.message.includes("Промокод уже использован")) {
                showNotification('Промокод уже использован максимальное количество раз', true);
            } else if (error.message.includes("Вы уже активировали")) {
                showNotification('Вы уже активировали этот промокод', true);
            } else if (error.message.includes("Промокод не найден")) {
                showNotification('Промокод не найден', true);
            } else if (error.message.includes("Промокод истек")) {
                showNotification('Промокод истек', true);
            } else if (error.message.includes("не активен")) {
                showNotification('Промокод не активен', true);
            } else {
                showNotification('Ошибка активации промокода: ' + error.message, true);
            }
        } finally {
            unlockButton(promoBtn, originalHTML);
            endTransaction(transactionId);
        }
    }

    function updateInventoryStats() {
        if (!userData.nfts) return;
        const total = userData.nfts.length;
        const common = userData.nfts.filter(nft => (nft.rarity || 'common') === 'common').length;
        const rare = userData.nfts.filter(nft => (nft.rarity || 'common') === 'rare').length;
        const epic = userData.nfts.filter(nft => (nft.rarity || 'common') === 'epic').length;
        const legendary = userData.nfts.filter(nft => (nft.rarity || 'common') === 'legendary').length;
        const countEl = document.getElementById('inventoryCount');
        const totalEl = document.getElementById('totalNFTs');
        const commonEl = document.getElementById('commonNFTs');
        const rareEl = document.getElementById('rareNFTs');
        const epicEl = document.getElementById('epicNFTs');
        const legendaryEl = document.getElementById('legendaryNFTs');
        if (countEl) countEl.textContent = `(${total})`;
        if (totalEl) totalEl.textContent = total;
        if (commonEl) commonEl.textContent = common;
        if (rareEl) rareEl.textContent = rare;
        if (epicEl) epicEl.textContent = epic;
        if (legendaryEl) legendaryEl.textContent = legendary;
    }

    function updateInventoryUI() {
        const inventoryContainer = document.getElementById('inventoryItems');
        if (!inventoryContainer) return;
        inventoryContainer.innerHTML = '';
        if (!userData.nfts || userData.nfts.length === 0) {
            inventoryContainer.innerHTML = `
                <div class="inventory-empty">
                    <i class="fas fa-box-open"></i>
                    <h3>📦 Ваш инвентарь пуст</h3>
                    <p>Купите NFT в магазине или откройте кейсы, чтобы получить первые предметы!</p>
                </div>
            `;
            updateInventoryStats();
            return;
        }
        let filteredNFTs = userData.nfts.filter(nft => (nft.rarity || 'common') === currentInventoryFilter);
        if (filteredNFTs.length === 0) {
            const rarityName = getRarityName(currentInventoryFilter);
            inventoryContainer.innerHTML = `
                <div class="inventory-empty">
                    <i class="fas fa-filter"></i>
                    <h3>Нет ${rarityName.toLowerCase()} NFT</h3>
                    <p>У вас нет NFT с редкостью "${rarityName}". Попробуйте другой фильтр или получите больше NFT!</p>
                </div>
            `;
            updateInventoryStats();
            return;
        }
        filteredNFTs.sort((a, b) => {
            const timeA = a.createdAt || a.purchasedAt || a.receivedAt || 0;
            const timeB = b.createdAt || b.purchasedAt || b.receivedAt || 0;
            return timeB - timeA;
        });
        filteredNFTs.forEach((nft, index) => {
            const basePrice = nft.basePrice || nft.price || 100;
            const sellPrice = Math.floor(basePrice * 0.7);
            const isSellable = !nft.nonSellable && basePrice > 0;
            const rarity = nft.rarity || 'common';
            const rarityName = getRarityName(rarity);
            let dateStr = '';
            if (nft.purchasedAt) {
                dateStr = new Date(nft.purchasedAt).toLocaleDateString();
            } else if (nft.receivedAt) {
                dateStr = new Date(nft.receivedAt).toLocaleDateString();
            } else {
                dateStr = 'Недавно';
            }
            let sourceText = '';
            if (nft.fromCase) {
                sourceText = `🎁 ${nft.fromCase}`;
            } else if (nft.fromPromocode) {
                sourceText = '🎫 Промокод';
            } else if (nft.source === 'marketplace') {
                sourceText = '🛒 Куплено';
            } else {
                sourceText = '✨ Получено';
            }
            const card = document.createElement('div');
            card.className = `inventory-card ${rarity}`;
            
            card.innerHTML = `
                <div class="rarity-badge ${rarity}">${rarityName}</div>
                <div class="inventory-image">
                    ${nft.imageUrl ? `<img src="${nft.imageUrl}" alt="${nft.name}">` : '<div class="no-image">🖼️</div>'}
                </div>
                <div class="inventory-info">
                    <div class="inventory-name">${nft.name}</div>
                    <div class="inventory-details">
                        <div class="inventory-source">${sourceText}</div>
                        <div>📅 ${dateStr}</div>
                        ${nft.basePrice ? `<div>💰 ${nft.basePrice} SAMD</div>` : ''}
                    </div>
                    <div class="inventory-actions">
                        <button class="send-nft-btn" onclick="window.openSendModal('${nft.nftId}')">
                            📤 Отправить
                        </button>
                        <button class="trade-nft-btn" onclick="window.addToTrade('${nft.nftId}')">
                            🔄 В трейд
                        </button>
                        ${isSellable ? `
                        <button class="sell-nft-btn" onclick="window.askConfirmation(() => window.sellNFT('${nft.nftId}'), 'Продать NFT &quot;${nft.name}&quot; за ${sellPrice} SAMD?')">
                            💰 ${sellPrice} SAMD
                        </button>` : ''}
                    </div>
                </div>
            `;
            inventoryContainer.appendChild(card);
        });
        updateInventoryStats();
        setTimeout(() => {
            inventoryContainer.style.display = 'none';
            void inventoryContainer.offsetHeight;
            inventoryContainer.style.display = 'grid';
        }, 50);
    }

    function updateUI() {
        const balanceSAMD = document.getElementById('balanceSAMD');
        const balanceTickets = document.getElementById('balanceTickets');
        const baseTitle = document.getElementById('baseTitle');
        const currentSAMD = document.getElementById('currentSAMD');
        const maxSAMD = document.getElementById('maxSAMD');
        const incomePerSec = document.getElementById('incomePerSec');
        const ticketsCount = document.getElementById('ticketsCount');
        const profileName = document.getElementById('profileName');
        const profileUsername = document.getElementById('profileUsername');
        const profileSAMD = document.getElementById('profileSAMD');
        const profileTickets = document.getElementById('profileTickets');
        const profileIncome = document.getElementById('profileIncome');
        const profileMax = document.getElementById('profileMax');
        const userId = document.getElementById('userId');
        const profileAvatar = document.getElementById('profileAvatar');
        if (balanceSAMD) balanceSAMD.textContent = Math.floor(userData.samd);
        if (balanceTickets) balanceTickets.textContent = userData.tickets;
        if (baseTitle) baseTitle.textContent = `🚀 Крипто База |${USERNAME}|`;
        if (currentSAMD) currentSAMD.textContent = userData.currentMining.toFixed(1);
        if (maxSAMD) maxSAMD.textContent = userData.maxMining;
        if (incomePerSec) incomePerSec.textContent = userData.incomePerSecond.toFixed(1);
        if (ticketsCount) ticketsCount.textContent = userData.tickets;
        if (profileName) profileName.textContent = FIRST_NAME;
        if (profileUsername) profileUsername.textContent = USERNAME ? `@${USERNAME}` : '';
        if (profileSAMD) profileSAMD.textContent = Math.floor(userData.samd);
        if (profileTickets) profileTickets.textContent = userData.tickets;
        if (profileIncome) profileIncome.textContent = userData.incomePerSecond.toFixed(1);
        if (profileMax) profileMax.textContent = userData.maxMining;
        if (userId) userId.textContent = USER_ID;
        if (user && user.photo_url && profileAvatar) {
            profileAvatar.src = user.photo_url;
        }
        updateMiningStatus();
    }

    function updateShopUI() {
        const shopContainer = document.getElementById('shopItems');
        if (!shopContainer) return;
        shopContainer.innerHTML = '';
        if (shopItems.length === 0) {
            shopContainer.innerHTML = '<div class="empty-state">🛒 В магазине пока что ничего нет</div>';
            return;
        }
        shopItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'shop-card';
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title">${item.name}</div>
                </div>
                <div class="card-description">${item.description}</div>
                <div class="card-stats">
                    <span>Осталось: ${item.currentStock || 0}</span>
                    <span>+${item.value} ${getItemUnit(item.type)}</span>
                </div>
                <button class="buy-btn" 
                        onclick="window.bshi('${item.id}')" 
                        ${userData.samd < item.price || (item.currentStock || 0) <= 0 ? 'disabled' : ''}>
                    Купить ${item.price} SAMD
                </button>
            `;
            shopContainer.appendChild(card);
        });
    }

    function updateNFTUI() {
        const nftContainer = document.getElementById('nftMarketplace');
        if (!nftContainer) return;
        nftContainer.innerHTML = '';
        if (nftItems.length === 0) {
            nftContainer.innerHTML = '<div class="empty-state-zwei">💎 В NFT магазине пока что ничего нет</div>';
            return;
        }
        nftItems.forEach(nft => {
            const card = document.createElement('div');
            card.className = 'nft-card';
            
            const nftImageHTML = nft.imageUrl ? 
                `<img src="${nft.imageUrl}" alt="${nft.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : 
                '';
            
            card.innerHTML = `
                <div class="nft-image">
                    ${nftImageHTML}
                    ${!nft.imageUrl ? '<div class="no-image">🖼️</div>' : ''}
                </div>
                <div class="nft-info">
                    <div class="nft-name">${nft.name}</div>
                    <div class="nft-price">
                        <div class="nft-stock">Осталось: ${nft.currentStock || 0}</div>
                    </div>
                    <button class="buy-btn" onclick="window.buyNFTItem('${nft.id}')" 
                            ${userData.samd < nft.price || (nft.currentStock || 0) <= 0 ? 'disabled' : ''}>
                        Купить ${nft.price} SAMD
                    </button>
                </div>
            `;
            nftContainer.appendChild(card);
        });
    }

    function updateCasesUI() {
        const casesContainer = document.getElementById('casesGrid');
        if (!casesContainer) return;
        casesContainer.innerHTML = '';
        if (cases.length === 0) {
            casesContainer.innerHTML = '<div class="empty-state">🎁 Кейсы пока не добавлены</div>';
            return;
        }
        cases.forEach(caseItem => {
            const card = document.createElement('div');
            card.className = 'case-card';
            card.onclick = () => window.openCaseConfirmModal(caseItem.id);
            card.innerHTML = `
                <div class="case-icon">🎁</div>
                <div class="case-title">${caseItem.name}</div>
                <div class="case-cost">${caseItem.cost} 🎟️</div>
                <div class="case-rewards">${caseItem.rewards ? caseItem.rewards.length : 0} возможных наград</div>
            `;
            casesContainer.appendChild(card);
        });
    }

    function updateTradeUI() {
        const tradeRequestsContainer = document.getElementById('tradeRequests');
        const myRequestsContainer = document.getElementById('myTradeRequests');
        if (tradeRequestsContainer) {
            tradeRequestsContainer.innerHTML = '';
            const incomingRequests = tradeRequests.filter(req => req.toUserId === USER_ID);
            if (incomingRequests.length === 0) {
                tradeRequestsContainer.innerHTML = '<div class="empty-state">📨 Нет входящих запросов на обмен</div>';
            } else {
                incomingRequests.forEach(request => {
                    const requestEl = document.createElement('div');
                    requestEl.className = 'trade-request-card';
                    requestEl.innerHTML = `
                        <div class="trade-request-header">
                            <div class="trade-request-from">От: @${request.fromUsername}</div>
                            <div class="trade-request-time">${new Date(request.createdAt).toLocaleDateString()}</div>
                        </div>
                        ${request.comment ? `<div class="trade-request-comment">${request.comment}</div>` : ''}
                        <div class="trade-request-offers">
                            <div class="trade-offer">
                                <h4>Предлагает:</h4>
                                ${request.fromOffer.nfts && request.fromOffer.nfts.length > 0 ? `<div>NFT: ${request.fromOffer.nfts.map(n => n.name).join(', ')}</div>` : ''}
                                ${request.fromOffer.samd > 0 ? `<div>SAMD: ${request.fromOffer.samd}</div>` : ''}
                                ${request.fromOffer.tickets > 0 ? `<div>Билеты: ${request.fromOffer.tickets}</div>` : ''}
                                ${!request.fromOffer.nfts?.length && request.fromOffer.samd === 0 && request.fromOffer.tickets === 0 ? '<div>Ничего</div>' : ''}
                            </div>
                            <div class="trade-offer">
                                <h4>Просит:</h4>
                                ${request.toOffer.nfts && request.toOffer.nfts.length > 0 ? `<div>NFT: ${request.toOffer.nfts.map(n => n.name).join(', ')}</div>` : ''}
                                ${request.toOffer.samd > 0 ? `<div>SAMD: ${request.toOffer.samd}</div>` : ''}
                                ${request.toOffer.tickets > 0 ? `<div>Билеты: ${request.toOffer.tickets}</div>` : ''}
                                ${!request.toOffer.nfts?.length && request.toOffer.samd === 0 && request.toOffer.tickets === 0 ? '<div>Ничего</div>' : ''}
                            </div>
                        </div>
                        <div class="trade-request-actions">
                            <button class="confirm-btn" onclick="window.acceptTrade('${request.id}')">Принять</button>
                            <button class="cancel-btn" onclick="window.declineTrade('${request.id}')">Отклонить</button>
                        </div>
                    `;
                    tradeRequestsContainer.appendChild(requestEl);
                });
            }
        }
        if (myRequestsContainer) {
            myRequestsContainer.innerHTML = '';
            const outgoingRequests = tradeRequests.filter(req => req.fromUserId === USER_ID);
            if (outgoingRequests.length === 0) {
                myRequestsContainer.innerHTML = '<div class="empty-state">📤 Нет исходящих запросов на обмен</div>';
            } else {
                outgoingRequests.forEach(request => {
                    const requestEl = document.createElement('div');
                    requestEl.className = 'trade-request-card';
                    requestEl.innerHTML = `
                        <div class="trade-request-header">
                            <div class="trade-request-to">Кому: @${request.toUsername}</div>
                            <div class="trade-request-time">${new Date(request.createdAt).toLocaleDateString()}</div>
                        </div>
                        ${request.comment ? `<div class="trade-request-comment">${request.comment}</div>` : ''}
                        <div class="trade-request-offers">
                            <div class="trade-offer">
                                <h4>Вы предлагаете:</h4>
                                ${request.fromOffer.nfts && request.fromOffer.nfts.length > 0 ? `<div>NFT: ${request.fromOffer.nfts.map(n => n.name).join(', ')}</div>` : ''}
                                ${request.fromOffer.samd > 0 ? `<div>SAMD: ${request.fromOffer.samd}</div>` : ''}
                                ${request.fromOffer.tickets > 0 ? `<div>Билеты: ${request.fromOffer.tickets}</div>` : ''}
                                ${!request.fromOffer.nfts?.length && request.fromOffer.samd === 0 && request.fromOffer.tickets === 0 ? '<div>Ничего</div>' : ''}
                            </div>
                            <div class="trade-offer">
                                <h4>Вы просите:</h4>
                                ${request.toOffer.nfts && request.toOffer.nfts.length > 0 ? `<div>NFT: ${request.toOffer.nfts.map(n => n.name).join(', ')}</div>` : ''}
                                ${request.toOffer.samd > 0 ? `<div>SAMD: ${request.toOffer.samd}</div>` : ''}
                                ${request.toOffer.tickets > 0 ? `<div>Билеты: ${request.toOffer.tickets}</div>` : ''}
                                ${!request.toOffer.nfts?.length && request.toOffer.samd === 0 && request.toOffer.tickets === 0 ? '<div>Ничего</div>' : ''}
                            </div>
                        </div>
                        <div class="trade-request-actions">
                            <button class="cancel-btn" onclick="window.cancelTrade('${request.id}')">Отменить</button>
                        </div>
                    `;
                    myRequestsContainer.appendChild(requestEl);
                });
            }
        }
    }

    function showCaseReward(reward) {
        const rewardImage = document.getElementById('rewardImage');
        const rewardName = document.getElementById('rewardName');
        const rewardRarity = document.getElementById('rewardRarity');
        const caseOpening = document.getElementById('caseOpening');
        if (rewardImage) rewardImage.src = reward.imageUrl || '';
        if (rewardName) rewardName.textContent = reward.name;
        if (rewardRarity) rewardRarity.textContent = `Редкость: ${reward.rarity || 'common'}`;
        if (caseOpening) caseOpening.classList.add('active');
    }

    function openCaseConfirmModal(caseId) {
        const caseItem = cases.find(c => c.id === caseId);
        if (!caseItem) return;
        if (userData.tickets < caseItem.cost) {
            showNotification('Недостаточно билетов!', true);
            return;
        }
        selectedCase = caseItem;
        const caseConfirmName = document.getElementById('caseConfirmName');
        const caseConfirmCost = document.getElementById('caseConfirmCost');
        const remainingTicketsCase = document.getElementById('remainingTicketsCase');
        const caseConfirmModal = document.getElementById('caseConfirmModal');
        const confirmCaseBtn = document.getElementById('confirmCaseBtn');
        if (caseConfirmName) caseConfirmName.textContent = caseItem.name;
        if (caseConfirmCost) caseConfirmCost.textContent = caseItem.cost;
        if (remainingTicketsCase) remainingTicketsCase.textContent = userData.tickets - caseItem.cost;
        if (caseConfirmModal) caseConfirmModal.classList.add('active');
        if (confirmCaseBtn) {
            confirmCaseBtn.onclick = () => {
                closeCaseConfirmModal();
                openCase(caseId);
            };
        }
    }

    function closeCaseConfirmModal() {
        const caseConfirmModal = document.getElementById('caseConfirmModal');
        if (caseConfirmModal) caseConfirmModal.classList.remove('active');
        selectedCase = null;
    }

    function closeCaseOpening() {
        const caseOpening = document.getElementById('caseOpening');
        if (caseOpening) caseOpening.classList.remove('active');
        closeCaseConfirmModal();
    }

    function openBuyConfirmModal(nftId) {
        const nft = nftItems.find(n => n.id === nftId);
        if (!nft) return;
        selectedNFT = nft;
        const buyNftName = document.getElementById('buyNftName');
        const buyNftPrice = document.getElementById('buyNftPrice');
        const userCurrentBalance = document.getElementById('userCurrentBalance');
        const buyConfirmModal = document.getElementById('buyConfirmModal');
        const confirmBuyBtn = document.getElementById('confirmBuyBtn');
        if (buyNftName) buyNftName.textContent = nft.name;
        if (buyNftPrice) buyNftPrice.textContent = nft.price;
        if (userCurrentBalance) userCurrentBalance.textContent = Math.floor(userData.samd);
        if (buyConfirmModal) buyConfirmModal.classList.add('active');
        if (confirmBuyBtn) {
            confirmBuyBtn.onclick = () => {
                closeBuyConfirmModal();
                buyNFTItem(nftId);
            };
        }
    }

    function closeBuyConfirmModal() {
        const buyConfirmModal = document.getElementById('buyConfirmModal');
        if (buyConfirmModal) buyConfirmModal.classList.remove('active');
        selectedNFT = null;
    }

    function openSendModal(nftId) {
        const nft = userData.nfts.find(n => n.nftId === nftId);
        if (!nft) return;
        selectedNFT = nft;
        const sendNftName = document.getElementById('sendNftName');
        const sendUsername = document.getElementById('sendUsername');
        const sendModal = document.getElementById('sendModal');
        const confirmSendBtn = document.getElementById('confirmSendBtn');
        if (sendNftName) sendNftName.textContent = nft.name;
        if (sendUsername) sendUsername.value = '';
        if (sendModal) sendModal.classList.add('active');
        if (confirmSendBtn) {
            confirmSendBtn.onclick = () => {
                if (sendUsername && sendUsername.value.trim()) {
                    sendNFT(nftId, sendUsername.value.trim());
                } else {
                    showNotification('Введите никнейм получателя', true);
                }
            };
        }
    }

    function closeSendModal() {
        const sendModal = document.getElementById('sendModal');
        if (sendModal) sendModal.classList.remove('active');
        selectedNFT = null;
    }

    async function sendNFT(nftId, recipientUsername) {
        const transactionId = `send_${nftId}_${Date.now()}`;
        if (!recipientUsername) {
            showNotification('Введите никнейм получателя', true);
            return;
        }
        const nftIndex = userData.nfts.findIndex(nft => nft.nftId === nftId);
        if (nftIndex === -1) {
            showNotification('NFT не найдено в вашем инвентаре', true);
            return;
        }
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        try {
            const usersSnapshot = await db.collection('users')
                .where('username', '==', recipientUsername)
                .get();
            if (usersSnapshot.empty) {
                showNotification('Пользователь с таким никнеймом не найден', true);
                endTransaction(transactionId);
                return;
            }
            const recipientDoc = usersSnapshot.docs[0];
            const recipientId = recipientDoc.id;
            if (recipientId === USER_ID) {
                showNotification('Нельзя отправить NFT самому себе', true);
                endTransaction(transactionId);
                return;
            }
            const senderRef = db.collection('users').doc(USER_ID);
            const recipientRef = db.collection('users').doc(recipientId);
            await db.runTransaction(async (transaction) => {
                const senderSnapshot = await transaction.get(senderRef);
                const recipientSnapshot = await transaction.get(recipientRef);
                if (!senderSnapshot.exists || !recipientSnapshot.exists) {
                    throw new Error("Пользователь не найден");
                }
                const senderData = senderSnapshot.data();
                const recipientData = recipientSnapshot.data();
                const senderNFTs = senderData.nfts || [];
                const nftIndex = senderNFTs.findIndex(n => n.nftId === nftId);
                if (nftIndex === -1) {
                    throw new Error("NFT не найдено у отправителя");
                }
                const nftToSend = senderNFTs[nftIndex];
                senderNFTs.splice(nftIndex, 1);
                const recipientNFTs = recipientData.nfts || [];
                recipientNFTs.push({
                    ...nftToSend,
                    receivedFrom: USERNAME,
                    receivedAt: new Date().toISOString()
                });
                transaction.update(senderRef, { nfts: senderNFTs });
                transaction.update(recipientRef, { nfts: recipientNFTs });
                return true;
            });
            closeSendModal();
            showNotification(`NFT отправлено пользователю @${recipientUsername}`);
        } catch (error) {
            console.error('Ошибка отправки NFT:', error);
            showNotification('Ошибка отправки NFT', true);
        } finally {
            endTransaction(transactionId);
        }
    }

    async function findUserForTrade() {
        const usernameInput = document.getElementById('tradeUsernameInput');
        const findBtn = document.getElementById('findUserBtn');
        if (!usernameInput || !findBtn) return;
        
        const username = usernameInput.value.trim();
        if (!username) {
            showNotification('Введите никнейм пользователя', true);
            return;
        }
        
        if (username === USERNAME) {
            showNotification('Нельзя отправить трейд самому себе', true);
            return;
        }
        
        const originalHTML = lockButton(findBtn);
        try {
            const usersSnapshot = await db.collection('users')
                .where('username', '==', username)
                .get();
            
            if (usersSnapshot.empty) {
                showNotification('Пользователь не найден', true);
                unlockButton(findBtn, originalHTML);
                return;
            }
            
            const userDoc = usersSnapshot.docs[0];
            const otherUserData = userDoc.data();
            
            selectedTradeUser = {
                id: userDoc.id,
                username: otherUserData.username,
                firstName: otherUserData.firstName || 'Пользователь',
                nfts: otherUserData.nfts || []
            };
            
            openTradeModal();
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            showNotification('Ошибка поиска пользователя', true);
        } finally {
            unlockButton(findBtn, originalHTML);
        }
    }

    function openTradeModal() {
        if (!selectedTradeUser) return;
        
        const tradeModal = document.getElementById('tradeModal');
        const tradeToUser = document.getElementById('tradeToUser');
        const closeTradeBtn = document.getElementById('closeTradeBtn');
        const sendTradeBtn = document.getElementById('sendTradeBtn');
        
        if (tradeToUser) tradeToUser.textContent = `@${selectedTradeUser.username}`;
        if (tradeModal) tradeModal.classList.add('active');
        
        if (closeTradeBtn) {
            closeTradeBtn.onclick = closeTradeModal;
        }
        if (sendTradeBtn) {
            sendTradeBtn.onclick = sendTradeRequest;
        }
        
        // Сбрасываем выбор перед обновлением
        resetTradeSelection();
        updateMyNFTsSelection();
        updateTheirNFTsSelection();
        updateTradeSelectionUI();
    }

    function closeTradeModal() {
        const tradeModal = document.getElementById('tradeModal');
        if (tradeModal) tradeModal.classList.remove('active');
        selectedTradeUser = null;
        resetTradeSelection();
    }

    function updateMyNFTsSelection() {
        const myNFTsContainer = document.getElementById('myAvailableNFTs');
        if (!myNFTsContainer) return;
        
        myNFTsContainer.innerHTML = '';
        
        if (!userData.nfts || userData.nfts.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-trade-selection';
            emptyMsg.textContent = 'У вас нет NFT';
            myNFTsContainer.appendChild(emptyMsg);
            return;
        }
        
        const availableNFTs = userData.nfts.filter(nft => 
            !tradeSelection.myNFTs.find(selected => selected.nftId === nft.nftId)
        );
        
        if (availableNFTs.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-trade-selection';
            emptyMsg.textContent = 'Все NFT уже выбраны';
            myNFTsContainer.appendChild(emptyMsg);
            return;
        }
        
        availableNFTs.forEach(nft => {
            const nftCard = document.createElement('div');
            nftCard.className = 'available-nft-card';
            nftCard.innerHTML = `
                <div class="available-nft-info">
                    <div class="available-nft-name">${nft.name}</div>
                    <div class="available-nft-rarity">${getRarityName(nft.rarity || 'common')}</div>
                </div>
                <button class="small-btn add-btn" onclick="window.addMyNFT('${nft.nftId}')">
                    Добавить
                </button>
            `;
            myNFTsContainer.appendChild(nftCard);
        });
    }

    function updateTheirNFTsSelection() {
        if (!selectedTradeUser || !selectedTradeUser.nfts) return;
        
        const theirNFTsContainer = document.getElementById('theirAvailableNFTs');
        if (!theirNFTsContainer) return;
        
        theirNFTsContainer.innerHTML = '';
        
        if (selectedTradeUser.nfts.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-trade-selection';
            emptyMsg.textContent = 'У пользователя нет NFT';
            theirNFTsContainer.appendChild(emptyMsg);
            return;
        }
        
        const availableNFTs = selectedTradeUser.nfts.filter(nft => 
            !tradeSelection.theirNFTs.find(selected => selected.nftId === nft.nftId)
        );
        
        if (availableNFTs.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-trade-selection';
            emptyMsg.textContent = 'Все NFT уже выбраны';
            theirNFTsContainer.appendChild(emptyMsg);
            return;
        }
        
        availableNFTs.forEach(nft => {
            const nftCard = document.createElement('div');
            nftCard.className = 'available-nft-card';
            nftCard.innerHTML = `
                <div class="available-nft-info">
                    <div class="available-nft-name">${nft.name}</div>
                    <div class="available-nft-rarity">${getRarityName(nft.rarity || 'common')}</div>
                </div>
                <button class="small-btn add-btn" onclick="window.addTheirNFT('${nft.nftId}')">
                    Добавить
                </button>
            `;
            theirNFTsContainer.appendChild(nftCard);
        });
    }

    function updateTradeSelectionUI() {
        const mySelectedNFTs = document.getElementById('mySelectedNFTs');
        const mySelectedSAMD = document.getElementById('mySelectedSAMD');
        const mySelectedTickets = document.getElementById('mySelectedTickets');
        const theirSelectedNFTs = document.getElementById('theirSelectedNFTs');
        const theirSelectedSAMD = document.getElementById('theirSelectedSAMD');
        const theirSelectedTickets = document.getElementById('theirSelectedTickets');
        
        if (mySelectedNFTs) {
            mySelectedNFTs.innerHTML = '';
            if (tradeSelection.myNFTs.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-trade-selection';
                emptyMsg.textContent = 'NFT не выбраны';
                mySelectedNFTs.appendChild(emptyMsg);
            } else {
                tradeSelection.myNFTs.forEach(nft => {
                    const nftEl = document.createElement('div');
                    nftEl.className = 'selected-nft';
                    nftEl.innerHTML = `
                        <span>${nft.name}</span>
                        <button onclick="window.removeMyNFT('${nft.nftId}')">×</button>
                    `;
                    mySelectedNFTs.appendChild(nftEl);
                });
            }
        }
        
        if (mySelectedSAMD) mySelectedSAMD.textContent = tradeSelection.mySAMD;
        if (mySelectedTickets) mySelectedTickets.textContent = tradeSelection.myTickets;
        
        if (theirSelectedNFTs) {
            theirSelectedNFTs.innerHTML = '';
            if (tradeSelection.theirNFTs.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-trade-selection';
                emptyMsg.textContent = 'NFT не выбраны';
                theirSelectedNFTs.appendChild(emptyMsg);
            } else {
                tradeSelection.theirNFTs.forEach(nft => {
                    const nftEl = document.createElement('div');
                    nftEl.className = 'selected-nft';
                    nftEl.innerHTML = `
                        <span>${nft.name}</span>
                        <button onclick="window.removeTheirNFT('${nft.nftId}')">×</button>
                    `;
                    theirSelectedNFTs.appendChild(nftEl);
                });
            }
        }
        
        if (theirSelectedSAMD) theirSelectedSAMD.textContent = tradeSelection.theirSAMD;
        if (theirSelectedTickets) theirSelectedTickets.textContent = tradeSelection.theirTickets;
    }

    function resetTradeSelection() {
        tradeSelection = {
            myNFTs: [],
            mySAMD: 0,
            myTickets: 0,
            theirNFTs: [],
            theirSAMD: 0,
            theirTickets: 0
        };
        updateTradeSelectionUI();
        if (selectedTradeUser) {
            updateMyNFTsSelection();
            updateTheirNFTsSelection();
        }
    }

    function addToTrade(nftId) {
        if (!selectedTradeUser) {
            showNotification('Сначала найдите пользователя для трейда', true);
            return;
        }
        
        const nft = userData.nfts.find(n => n.nftId === nftId);
        if (!nft) return;
        
        addMyNFT(nftId);
    }

    function addMyNFT(nftId) {
        const nft = userData.nfts.find(n => n.nftId === nftId);
        if (!nft) return;
        
        if (tradeSelection.myNFTs.find(n => n.nftId === nftId)) {
            showNotification('Это NFT уже добавлено', true);
            return;
        }
        
        tradeSelection.myNFTs.push(nft);
        updateTradeSelectionUI();
        updateMyNFTsSelection();
    }

    function removeMyNFT(nftId) {
        tradeSelection.myNFTs = tradeSelection.myNFTs.filter(n => n.nftId !== nftId);
        updateTradeSelectionUI();
        updateMyNFTsSelection();
    }

    function addTheirNFT(nftId) {
        if (!selectedTradeUser || !selectedTradeUser.nfts) return;
        
        const nft = selectedTradeUser.nfts.find(n => n.nftId === nftId);
        if (!nft) return;
        
        if (tradeSelection.theirNFTs.find(n => n.nftId === nftId)) {
            showNotification('Это NFT уже добавлено', true);
            return;
        }
        
        tradeSelection.theirNFTs.push(nft);
        updateTradeSelectionUI();
        updateTheirNFTsSelection();
    }

    function removeTheirNFT(nftId) {
        tradeSelection.theirNFTs = tradeSelection.theirNFTs.filter(n => n.nftId !== nftId);
        updateTradeSelectionUI();
        updateTheirNFTsSelection();
    }

    function addMySAMD(amount) {
        const newAmount = tradeSelection.mySAMD + amount;
        if (newAmount < 0) {
            tradeSelection.mySAMD = 0;
        } else if (userData.samd >= newAmount) {
            tradeSelection.mySAMD = newAmount;
        } else if (amount > 0) {
            showNotification('Недостаточно SAMD', true);
        }
        updateTradeSelectionUI();
    }

    function addMyTickets(amount) {
        const newAmount = tradeSelection.myTickets + amount;
        if (newAmount < 0) {
            tradeSelection.myTickets = 0;
        } else if (userData.tickets >= newAmount) {
            tradeSelection.myTickets = newAmount;
        } else if (amount > 0) {
            showNotification('Недостаточно билетов', true);
        }
        updateTradeSelectionUI();
    }

    function addTheirSAMD(amount) {
        const newAmount = tradeSelection.theirSAMD + amount;
        tradeSelection.theirSAMD = newAmount < 0 ? 0 : newAmount;
        updateTradeSelectionUI();
    }

    function addTheirTickets(amount) {
        const newAmount = tradeSelection.theirTickets + amount;
        tradeSelection.theirTickets = newAmount < 0 ? 0 : newAmount;
        updateTradeSelectionUI();
    }

    async function sendTradeRequest() {
        if (!selectedTradeUser) return;
        
        const commentInput = document.getElementById('tradeComment');
        const comment = commentInput ? commentInput.value.trim() : '';
        
        if (tradeSelection.myNFTs.length === 0 && tradeSelection.mySAMD === 0 && tradeSelection.myTickets === 0 &&
            tradeSelection.theirNFTs.length === 0 && tradeSelection.theirSAMD === 0 && tradeSelection.theirTickets === 0) {
            showNotification('Выберите предметы для обмена', true);
            return;
        }
        
        if (tradeSelection.mySAMD > userData.samd) {
            showNotification('Недостаточно SAMD', true);
            return;
        }
        
        if (tradeSelection.myTickets > userData.tickets) {
            showNotification('Недостаточно билетов', true);
            return;
        }
        
        const transactionId = `trade_request_${Date.now()}`;
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        
        const sendTradeBtn = document.getElementById('sendTradeBtn');
        const originalHTML = lockButton(sendTradeBtn);
        
        try {
            const fromOffer = {
                nfts: tradeSelection.myNFTs.map(nft => ({
                    nftId: nft.nftId,
                    name: nft.name,
                    rarity: nft.rarity || 'common',
                    basePrice: nft.basePrice || 100
                })),
                samd: tradeSelection.mySAMD,
                tickets: tradeSelection.myTickets
            };
            
            const toOffer = {
                nfts: tradeSelection.theirNFTs.map(nft => ({
                    nftId: nft.nftId,
                    name: nft.name,
                    rarity: nft.rarity || 'common',
                    basePrice: nft.basePrice || 100
                })),
                samd: tradeSelection.theirSAMD,
                tickets: tradeSelection.theirTickets
            };
            
            await db.collection('tradeRequests').add({
                fromUserId: USER_ID,
                fromUsername: USERNAME,
                toUserId: selectedTradeUser.id,
                toUsername: selectedTradeUser.username,
                fromOffer: fromOffer,
                toOffer: toOffer,
                comment: comment,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: Date.now()
            });
            
            closeTradeModal();
            showNotification(`✅ Запрос на обмен отправлен @${selectedTradeUser.username}`);
            resetTradeSelection();
            
        } catch (error) {
            console.error('Ошибка отправки трейда:', error);
            showNotification('Ошибка отправки трейда: ' + error.message, true);
        } finally {
            unlockButton(sendTradeBtn, originalHTML);
            endTransaction(transactionId);
        }
    }

    async function acceptTrade(tradeId) {
        const transactionId = `accept_trade_${tradeId}`;
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        
        try {
            const tradeRef = db.collection('tradeRequests').doc(tradeId);
            const tradeDoc = await tradeRef.get();
            
            if (!tradeDoc.exists) {
                showNotification('Запрос на обмен не найден', true);
                endTransaction(transactionId);
                return;
            }
            
            const tradeData = tradeDoc.data();
            
            if (tradeData.toUserId !== USER_ID) {
                showNotification('Это не ваш запрос на обмен', true);
                endTransaction(transactionId);
                return;
            }
            
            const fromUserRef = db.collection('users').doc(tradeData.fromUserId);
            const toUserRef = db.collection('users').doc(USER_ID);
            
            await db.runTransaction(async (transaction) => {
                const fromUserDoc = await transaction.get(fromUserRef);
                const toUserDoc = await transaction.get(toUserRef);
                
                if (!fromUserDoc.exists || !toUserDoc.exists) {
                    throw new Error("Пользователь не найден");
                }
                
                const fromUserData = fromUserDoc.data();
                const toUserData = toUserDoc.data();
                
                if (fromUserData.samd < (tradeData.fromOffer.samd || 0)) {
                    throw new Error("У отправителя недостаточно SAMD");
                }
                
                if (fromUserData.tickets < (tradeData.fromOffer.tickets || 0)) {
                    throw new Error("У отправителя недостаточно билетов");
                }
                
                if (toUserData.samd < (tradeData.toOffer.samd || 0)) {
                    throw new Error("У вас недостаточно SAMD");
                }
                
                if (toUserData.tickets < (tradeData.toOffer.tickets || 0)) {
                    throw new Error("У вас недостаточно билетов");
                }
                
                const fromUserNFTs = fromUserData.nfts || [];
                const fromNFTIds = tradeData.fromOffer.nfts?.map(n => n.nftId) || [];
                
                for (const nftId of fromNFTIds) {
                    if (!fromUserNFTs.find(n => n.nftId === nftId)) {
                        throw new Error("У отправителя нет одного из NFT");
                    }
                }
                
                const toUserNFTs = toUserData.nfts || [];
                const toNFTIds = tradeData.toOffer.nfts?.map(n => n.nftId) || [];
                
                for (const nftId of toNFTIds) {
                    if (!toUserNFTs.find(n => n.nftId === nftId)) {
                        throw new Error("У вас нет одного из NFT");
                    }
                }
                
                transaction.update(fromUserRef, {
                    samd: firebase.firestore.FieldValue.increment(
                        (tradeData.toOffer.samd || 0) - (tradeData.fromOffer.samd || 0)
                    ),
                    tickets: firebase.firestore.FieldValue.increment(
                        (tradeData.toOffer.tickets || 0) - (tradeData.fromOffer.tickets || 0)
                    )
                });
                
                transaction.update(toUserRef, {
                    samd: firebase.firestore.FieldValue.increment(
                        (tradeData.fromOffer.samd || 0) - (tradeData.toOffer.samd || 0)
                    ),
                    tickets: firebase.firestore.FieldValue.increment(
                        (tradeData.fromOffer.tickets || 0) - (tradeData.toOffer.tickets || 0)
                    )
                });
                
                const newFromUserNFTs = fromUserNFTs.filter(n => !fromNFTIds.includes(n.nftId));
                const newToUserNFTs = toUserNFTs.filter(n => !toNFTIds.includes(n.nftId));
                
                const fromNFTsToReceive = tradeData.toOffer.nfts || [];
                fromNFTsToReceive.forEach(nft => {
                    newFromUserNFTs.push({
                        ...nft,
                        receivedFrom: USERNAME,
                        receivedAt: new Date().toISOString()
                    });
                });
                
                const toNFTsToReceive = tradeData.fromOffer.nfts || [];
                toNFTsToReceive.forEach(nft => {
                    newToUserNFTs.push({
                        ...nft,
                        receivedFrom: tradeData.fromUsername,
                        receivedAt: new Date().toISOString()
                    });
                });
                
                transaction.update(fromUserRef, { nfts: newFromUserNFTs });
                transaction.update(toUserRef, { nfts: newToUserNFTs });
                
                // Обновляем статус трейда
                transaction.update(tradeRef, {
                    status: 'accepted',
                    acceptedAt: new Date().toISOString(),
                    updatedAt: Date.now()
                });
                
                return true;
            });
            
            showNotification(`✅ Обмен с @${tradeData.fromUsername} завершен успешно!`);
            
        } catch (error) {
            console.error('Ошибка принятия трейда:', error);
            showNotification('Ошибка принятия трейда: ' + error.message, true);
        } finally {
            endTransaction(transactionId);
        }
    }

    async function declineTrade(tradeId) {
        const transactionId = `decline_trade_${tradeId}`;
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        
        try {
            await db.collection('tradeRequests').doc(tradeId).update({
                status: 'declined',
                declinedAt: new Date().toISOString(),
                updatedAt: Date.now()
            });
            
            showNotification('❌ Запрос на обмен отклонен');
            
        } catch (error) {
            console.error('Ошибка отклонения трейда:', error);
            showNotification('Ошибка отклонения трейда', true);
        } finally {
            endTransaction(transactionId);
        }
    }

    async function cancelTrade(tradeId) {
        const transactionId = `cancel_trade_${tradeId}`;
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        
        try {
            await db.collection('tradeRequests').doc(tradeId).update({
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
                updatedAt: Date.now()
            });
            
            showNotification('🗑️ Запрос на обмен отменен');
            
        } catch (error) {
            console.error('Ошибка отмены трейда:', error);
            showNotification('Ошибка отмены трейда', true);
        } finally {
            endTransaction(transactionId);
        }
    }

    function showNotification(message, isError = false, isWarning = false) {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notificationText');
        
        if (!notification || !notificationText) return;
        
        notificationText.textContent = message;
        notification.className = 'notification';
        
        if (isError) {
            notification.classList.add('error');
        } else if (isWarning) {
            notification.classList.add('warning');
        }
        
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    function getItemUnit(type) {
        switch(type) {
            case 'income': return 'SAMD/сек';
            case 'max': return 'макс. SAMD';
            case 'tickets': return '🎟️';
            default: return '';
        }
    }

    function getRarityName(rarity) {
        switch(rarity) {
            case 'common': return 'Обычный';
            case 'rare': return 'Редкий';
            case 'epic': return 'Эпический';
            case 'legendary': return 'Легендарный';
            default: return 'Обычный';
        }
    }

    function updateInventoryFilter(filter) {
        currentInventoryFilter = filter;
        updateInventoryUI();
    }

    function askConfirmation(callback, message) {
        const confirmationModal = document.getElementById('confirmationModal');
        const confirmationTitle = document.getElementById('confirmationTitle');
        const confirmationText = document.getElementById('confirmationText');
        const confirmYesBtn = document.getElementById('confirmYesBtn');
        const confirmNoBtn = document.getElementById('confirmNoBtn');
        
        if (!confirmationModal || !confirmationText || !confirmYesBtn || !confirmNoBtn) return;
        
        confirmationText.textContent = message;
        confirmationModal.style.display = 'flex';
        
        const handleYes = () => {
            confirmationModal.style.display = 'none';
            if (callback) callback();
            confirmYesBtn.removeEventListener('click', handleYes);
            confirmNoBtn.removeEventListener('click', handleNo);
        };
        
        const handleNo = () => {
            confirmationModal.style.display = 'none';
            confirmYesBtn.removeEventListener('click', handleYes);
            confirmNoBtn.removeEventListener('click', handleNo);
        };
        
        confirmYesBtn.addEventListener('click', handleYes);
        confirmNoBtn.addEventListener('click', handleNo);
    }

    async function resetProgress() {
        const transactionId = `reset_${Date.now()}`;
        if (!startTransaction(transactionId)) {
            showNotification('Подождите, идет другая операция', true);
            return;
        }
        
        try {
            await db.collection('users').doc(USER_ID).update({
                samd: 0,
                tickets: 0,
                currentMining: 0,
                maxMining: 500,
                incomePerSecond: 0.1,
                lastMiningUpdate: Date.now(),
                isMining: false,
                upgrades: [],
                nfts: [],
                activatedPromocodes: [],
                updatedAt: Date.now()
            });
            
            userData = {
                samd: 0,
                tickets: 0,
                currentMining: 0,
                maxMining: 500,
                incomePerSecond: 0.1,
                lastMiningUpdate: Date.now(),
                isMining: false,
                upgrades: [],
                nfts: [],
                activatedPromocodes: []
            };
            
            updateUI();
            updateInventoryUI();
            showNotification('Прогресс сброшен успешно!');
            
        } catch (error) {
            console.error('Ошибка сброса прогресса:', error);
            showNotification('Ошибка сброса прогресса', true);
        } finally {
            endTransaction(transactionId);
        }
    }

    window.openSendModal = openSendModal;
    window.closeSendModal = closeSendModal;
    window.closeCaseConfirmModal = closeCaseConfirmModal;
    window.closeCaseOpening = closeCaseOpening;
    window.openBuyConfirmModal = openBuyConfirmModal;
    window.closeBuyConfirmModal = closeBuyConfirmModal;
    window.openCaseConfirmModal = openCaseConfirmModal;
    window.buyNFTItem = buyNFTItem;
    window.sellNFT = sellNFT;
    window.sendNFT = sendNFT;
    window.openCase = openCase;
    window.askConfirmation = askConfirmation;
    window.resetProgress = resetProgress;
    window.findUserForTrade = findUserForTrade;
    window.addToTrade = addToTrade;
    window.removeMyNFT = removeMyNFT;
    window.removeTheirNFT = removeTheirNFT;
    window.addMySAMD = (amount) => addMySAMD(amount);
    window.addMyTickets = (amount) => addMyTickets(amount);
    window.addTheirSAMD = (amount) => addTheirSAMD(amount);
    window.addTheirTickets = (amount) => addTheirTickets(amount);
    window.addMyNFT = (nftId) => addMyNFT(nftId);
    window.addTheirNFT = (nftId) => addTheirNFT(nftId);
    window.sendTradeRequest = sendTradeRequest;
    window.acceptTrade = acceptTrade;
    window.declineTrade = declineTrade;
    window.cancelTrade = cancelTrade;
    window.closeTradeModal = closeTradeModal;
    window.updateInventoryFilter = updateInventoryFilter;
    window.activatePromocode = activatePromocode;

    document.addEventListener('DOMContentLoaded', function() {
        const promoBtn = document.getElementById('profilePromocodeBtn');
        const promoInput = document.getElementById('profilePromocodeInput');
        
        if (promoBtn && promoInput) {
            promoBtn.addEventListener('click', function() {
                activatePromocode(promoInput.value);
            });
            
            promoInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    activatePromocode(promoInput.value);
                }
            });
        }
        
        // Добавляем обработчик для кнопки поиска пользователя
        const findUserBtn = document.getElementById('findUserBtn');
        if (findUserBtn) {
            findUserBtn.addEventListener('click', findUserForTrade);
        }
        
        // Добавляем обработчик Enter для поля поиска пользователя
        const tradeUsernameInput = document.getElementById('tradeUsernameInput');
        if (tradeUsernameInput) {
            tradeUsernameInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    findUserForTrade();
                }
            });
        }
    });

    document.addEventListener('DOMContentLoaded', loadUserData);

})();