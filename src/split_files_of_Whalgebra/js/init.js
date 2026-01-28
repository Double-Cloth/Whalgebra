/**
 * @global
 * @description 点击事件监听器，用于处理页面上的用户交互。
 * 它通过检查被点击元素的 ID、类名和父元素信息来分发操作。
 */
document.addEventListener('click', (event) => {
    "use strict";

    // 1. 获取实际点击的目标元素
    let target = event.target;

    // 2. 如果点击的是 P 标签且不在 input 容器内，则视为点击了其父容器
    if (target.tagName.toLowerCase() === 'p' && target.parentNode?.id !== 'input') {
        target = target.parentNode;
    }

    // 3. 提取关键属性，减少后续重复访问 DOM 的开销
    const {id: targetID, className: targetClass} = target;
    // 获取第一个子元素的类名 (通常用于识别按钮功能，如 _exe_, _ac_)
    const firstChildClass = target.firstElementChild?.className || '';
    const parent = target.parentNode;
    const parentID = parent?.id || '';

    console.log({parentID, targetID, targetClass, firstChildClass});

    // --- 策略 1: 基于明确 ID 的快速分发 (Exact Matches) ---
    switch (targetID) {
        case 'head_setting':
            return PageControlTools.headChangeModes();

        case 'head_title':
            return PageControlTools.moveShip();

        case 'main_cover':
            return PageControlTools.clickMainCover();

        case 'print_close':
            return PageControlTools.closePrint();

        case 'head_explain':
        case 'explain_close':
            return PageControlTools.headChangeExplain();

        case 'input':
            if (HtmlTools.isScrolledToRight(HtmlTools.getHtml('#input'))) {
                InputManager.moveCursor('end');
            }
            return;

        case 'load_cancel':
            return PageControlTools.cancelPrint();

        case 'print_1_0_choose':
            return PageControlTools.clickPrint1Choose();

        case 'print_content_1_cover':
            return PageControlTools.clickPrint1Cover();
    }

    // --- 策略 2: 基于父容器 ID 的逻辑 (Group Logic) ---
    const showMoreFunc = () => PageControlTools.changeSubKeyboard('SortSvg');

    switch (parentID) {
        case 'switch_knob_on':
        case 'switch_knob_off':
        case 'switch_knob':
        case 'switch_container':
        case 'switch_container_father':
            PageConfig.calcAccMode = 1 - PageConfig.calcAccMode;
            return;

        case 'sort_svg':
        case 'keyboard_top_more':
            return showMoreFunc();

        case 'keyboard_top': {
            // 键盘顶部功能区逻辑
            const handlers = {
                '_2nd_': () => PageConfig.keyboardType = 1 - PageConfig.keyboardType,
                '_trigonometry_': () => PageControlTools.changeSubKeyboard('_trigonometry_'),
                '_functions_': () => PageControlTools.changeSubKeyboard('_functions_')
            };

            // 如果在处理器映射中找到对应类名，执行对应函数；否则移动光标
            if (handlers[firstChildClass]) {
                handlers[firstChildClass]();
            } else if (targetID === 'keyboard_top_more') {
                showMoreFunc();
            } else {
                // 提取光标移动方向，例如 class="_cursor_left_" -> "left"
                // 假设 class 格式固定，从索引 13 开始截取
                const direction = firstChildClass.slice(13).toLowerCase();
                if (direction) {
                    InputManager.moveCursor(direction);
                }
            }
            return;
        }
    }

    // 屏幕输入区切换 (screen_input_2, screen_input_3...)
    if (parentID.startsWith('screen_input_')) {
        const modeIndex = parentID.slice(-1); // 获取最后一位数字
        PageConfig.subModes = {'default': modeIndex};
        PageControlTools.syncScreenToInput();
        return;
    }

    if (parentID === 'input' && targetID === '') {
        return InputManager.clickMoveCursor(target);
    }

    // --- 策略 3: 基于正则或特定类名的模式匹配 (Pattern Matches) ---

    // 键盘遮罩层
    if (targetID.includes('keyboard_cover')) {
        return PageControlTools.changeSubKeyboard('allNotShow');
    }

    // 模式切换 (mode_0 到 mode_4)
    if (/^mode_[0-4]$/.test(targetID)) {
        const mode = targetID.slice(-1);
        PageConfig.currentMode = (mode === '2') ? '2_0' : mode;
        // 修复: 使用箭头函数替代字符串，更安全且性能更好
        setTimeout(() => PageControlTools.clickMainCover(), 340);
        return;
    }

    // 统计模式数据切换 (DataX, DataY)
    if (/Data[XY]/.test(targetClass)) {
        // 获取点击元素在表格中的位置
        const children = HtmlTools.getHtml('#grid_data').children;
        const name = [];
        // 从被点击的单元格逆向推导出其在网格中的行和列索引。
        name[0] = [...children].indexOf(target.parentNode);
        name[1] = target.classList.contains('DataX') ? 0 : 1;
        // 更改子模式
        PageConfig.subModes = {'default': name};
        PageControlTools.syncScreenToInput();
        return;
    }

    // 打印精度/模式 (print_0, print_1)
    if (/^print_[0-1]$/.test(targetID)) {
        PageConfig.printMode = targetID.slice(-1);
        return;
    }

    // 键盘样式输入
    if (/KeyboardStyle[13]/.test(targetClass)) {
        if (firstChildClass === '_add_line_') {
            const currentSubModes = PageConfig.subModes['1'];
            const succeed = InputManager.statisticsAddLine({
                location: currentSubModes,
                inputListX: currentSubModes[1] === 0 ? ['_0_'] : [],
                inputListY: currentSubModes[1] === 0 ? [] : ['_0_']
            });
            if (succeed && !HtmlTools.getHtml('.InputTip')) {
                InputManager.ac();
            }
            return;
        }
        if (firstChildClass === '_del_line_') {
            return InputManager.statisticsDelLine();
        }
        InputManager.input(HtmlTools.getClassList(target));
        if (targetClass.includes('NeedParentheses') && PageConfig.keyboardType === 1) {
            InputManager.input(['_parentheses_left_']);
        }
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
        return;
    }

    if (/title_mode_([0134]|2_[01])|screen_title/.test(targetID)) {
        if (document.fullscreenElement) {
            // 进入全屏
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
        return;
    }

    if (/^choose_ra_[0-6]$/.test(targetID)) {
        return PageControlTools.changePrint1Ra(targetID);
    }

    if (/^export_[0-1]$/.test(targetID)) {
        return PageControlTools.exportRa(targetID);
    }

    // --- 策略 4: 基于子元素图标功能的通用按钮 (Functional Buttons) ---

    switch (firstChildClass) {
        case '_exe_':
            return PrintManager.exe();
        case '_ac_':
            return InputManager.ac();
        case '_del_': {
            InputManager.del();
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }
    }
});

/**
 * @global
 * @description 监听全局键盘按下事件，以实现通过物理键盘与计算器进行交互的功能。
 * 此监听器捕获按键事件，并根据按下的键执行相应的操作，如输入数字/运算符、删除字符、移动光标或执行计算。
 * 它通过调用 `HtmlTools` 和 `PageControlTools` 中的方法来间接操作 DOM 和应用程序状态。
 *
 * @param {KeyboardEvent} event - 浏览器传递的键盘事件对象。
 */
document.addEventListener('keydown', (event) => {
    "use strict";

    // 获取按下的键的字符串表示形式
    const key = event.key;

    // 1. 优先处理功能控制键 (Switch 结构更清晰)
    switch (key) {
        case 'Backspace': {
            event.preventDefault(); // 阻止浏览器默认的退格行为（如返回上一页）
            InputManager.del('left', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }

        case 'Delete': {
            event.preventDefault(); // 阻止浏览器默认的退格行为（如返回上一页）
            InputManager.del('right', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;
        }

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
            event.preventDefault(); // 阻止光标在页面上滚动
            // 将 'ArrowLeft' 转换为 'left'，并调用光标移动函数
            return InputManager.moveCursor(key.slice(5).toLowerCase(), event.shiftKey);

        case 'Enter':
            // Enter 的逻辑判断
            event.preventDefault(); // 阻止表单提交等默认行为
            // 如果设置或说明面板是打开的（通过检查遮罩层），则关闭它们
            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay')) {
                return PageControlTools.clickMainCover();
            }
            // 如果当前在打印/结果视图，则关闭它返回到输入视图
            if (!HtmlTools.getHtml('#main').classList.contains('Input')) {
                if (!HtmlTools.getHtml('#load_cover').classList.contains('NoDisplay')) {
                    return PageControlTools.cancelPrint();
                }
                return PageControlTools.closePrint();
            }
            // 否则，执行计算
            return PrintManager.exe();
    }

    // 2. 处理字符输入 (字母/数字/E)
    // 使用正则表达式匹配单个字母、数字或 'E'
    if (/^([a-z0-9E])$/.test(key)) {
        event.preventDefault(); // 阻止将字符输入到非预期的元素中
        // 处理 Alt 组合键
        if (event.altKey && ['e', 'i', 'x'].includes(key)) {
            InputManager.input([`_${key}_mathit_`]);
        } else {
            // 普通字符输入
            InputManager.input([`_${key}_`]);
        }
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
        return;
    }

    // 3. 处理运算符
    // 使用正则表达式匹配常见的数学运算符
    if (/^[+\-*/^|!,.()]$/.test(key)) {
        event.preventDefault(); // 阻止默认的浏览器快捷键或行为
        // 将按键字符转换为对应的 HTML 类名并插入到输入区域
        InputManager.input(HtmlTools.textToHtmlClass(HtmlTools.deleteIllegal(key)));
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
    }
});

/**
 * @global
 * @function window.onload
 * @description 当页面完全加载后执行此函数。
 * 它的主要职责是从 localStorage 中恢复计算器的上一次会话状态，
 * 包括主操作模式 (currentMode) 和各个模式下的子模式 (subModes) 设置。
 * 这确保了用户在刷新或重新访问页面时能够看到他们离开时的界面和配置。
 */
window.addEventListener('load', () => {
    "use strict";

    const getStore = (key) => localStorage.getItem(key);

    /**
     * 安全恢复 LocalStorage 数据的辅助函数。
     * * 此函数尝试读取指定键的数据：
     * 1. 如果数据存在，执行 `func` 进行恢复。
     * 2. 如果数据不存在且提供了 `defaultFunc`，执行 `defaultFunc` 设置默认状态。
     * 3. 执行过程中的任何异常（如 JSON 解析错误或 setter 校验失败）都会被捕获，并打印警告、清除损坏数据，从而防止页面初始化崩溃。
     *
     * @param {string} dataName - LocalStorage 键名
     * @param {function(string): void} func - 有数据时的恢复函数
     * @param {function(): void} [defaultFunc=null] - 无数据时的默认函数
     * @returns {void}
     */
    const recoverData = (dataName, func, defaultFunc = null) => {
        const currentData = getStore(dataName);

        try {
            if (currentData !== null) {
                // 数据存在，传入数据
                func(currentData);
            } else if (defaultFunc) {
                // 数据不存在且有默认处理，无参调用
                defaultFunc();
            }
        } catch (e) {
            console.warn(`[GLOBAL] LocalStorage ${dataName} corrupted, resetting.`);
            localStorage.removeItem(dataName);
        }
    };

    // --- 开始恢复 (恢复顺序：数据层 -> UI层) ---

    // 屏幕数据
    recoverData('screenData', (data) => {
        data = JSON.parse(data);
        for (const key in data) {
            if (key !== '1') {
                const place = HtmlTools.getHtml(`#screen_input_inner_${key}`);
                const inner = data[key];
                HtmlTools.appendDOMs(place, HtmlTools.textToHtmlClass(inner), {mode: 'replace'});
                PageConfig.screenData = {[key]: inner};
            } else {
                const list = data[key];
                const len = list.length;
                for (let i = 0; i < len; i++) {
                    InputManager.statisticsAddLine({
                        location: [i, 0],
                        inputListX: HtmlTools.textToHtmlClass(list[i][0]),
                        inputListY: HtmlTools.textToHtmlClass(list[i][1]),
                        recoverMode: true
                    });
                }
                PageConfig.screenData = {['1']: list};
            }
        }
    });

    // 子模式 (需要 JSON.parse)
    recoverData('subModes', (data) => {
        PageConfig.subModes = JSON.parse(data);
    });

    // 键盘类型
    recoverData('keyboardType', (data) => {
        PageConfig.keyboardType = Number(data);
    });

    // 打印模式
    recoverData('printMode', (data) => {
        PageConfig.printMode = data;
    });

    // 计算精度
    // 如果有数据则 Number(data)，如果没有数据则设为 0
    recoverData(
        'calcAccMode',
        (data) => PageConfig.calcAccMode = Number(data),
        () => PageConfig.calcAccMode = 0
    );

    // 当前模式
    recoverData('currentMode', (data) => {
        PageConfig.currentMode = data;
    });

    HtmlTools.scrollToView();
});