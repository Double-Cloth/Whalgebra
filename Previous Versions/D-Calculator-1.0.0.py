def nan(x):
    return not float('-inf') < x < float('inf')


def fact(x):
    x = round(x, 13)
    if x % 1 != 0 or x < 0 or nan(x):
        out = float("nan")
    else:
        x = int(x)
        if x == 0:
            out = 1
        else:
            out = x
            for i in range(1, x):
                out = out * (x - i)
    return (out)


def induce(x):
    if x > 10 ** 10 or nan(x):
        x = float("nan")
    else:
        x = x % (2 * pi)
        if x >= 0 and x > pi:
            x = x - 2 * pi
        elif x < 0 and x < -pi:
            x = x + 2 * pi
    return (x)


def sin(x):
    kx = x
    x = abs(x)
    out = 0
    x = induce(x)
    if nan(x):
        out = float("nan")
    else:
        if x == 0 or abs(x) == pi:
            out = 0
        else:
            for i in range(16):
                out = out + pow(-1, i) * pow(x, 2 * i + 1) / fact(2 * i + 1)
            if 0 < x < pi:
                out = abs(out)
            else:
                out = -abs(out)
        out = sgn(kx) * out
    return (out)


def cos(x):
    out = 0
    x = abs(x)
    x = induce(x)
    if nan(x):
        out = float("nan")
    else:
        if x == pi / 2:
            out = 0
        else:
            for i in range(16):
                out = out + pow(-1, i) * pow(x, 2 * i) / fact(2 * i)
            if 0 <= x < pi / 2:
                out = abs(out)
            else:
                out = -abs(out)
    return (out)


def tan(x):
    s = sin(x)
    c = cos(x)
    if c == 0 or nan(c) or nan(s):
        out = float("nan")
    else:
        out = s / c
    return (out)


def arcsin(x):
    dt = 0
    out = -pi / 2
    if abs(x) > 1 or nan(x):
        out = float("nan")
    else:
        for i in range(1, 16):
            if dt == 0:
                while dt == 0:
                    if sin(out) < x:
                        out = out + pi / (10 ** i)
                    else:
                        dt = 1
            else:
                while dt == 1:
                    if sin(out) > x:
                        out = out - pi / (10 ** i)
                    else:
                        dt = 0
            if sin(out) == x:
                break
    return (out)


def arccos(x):
    out = dt = 0
    if abs(x) > 1 or nan(x):
        out = float("nan")
    else:
        for i in range(1, 16):
            if dt == 0:
                while dt == 0:
                    if cos(out) > x:
                        out = out + pi / (10 ** i)
                    else:
                        dt = 1
            else:
                while dt == 1:
                    if cos(out) < x:
                        out = out - pi / (10 ** i)
                    else:
                        dt = 0
            if cos(out) == x:
                break
    return (out)


def atan(x):
    x = tan(x)
    if nan(x):
        x = tan(pi / 2 - 10 ** -15)
    return (x)


def arctan(x):
    out = 0
    if abs(x) >= tan(pi / 2 - 10 ** -15) or nan(x):
        out = float("nan")
    else:
        if x >= 0:
            dt = 0
        else:
            dt = 1
        for i in range(1, 16):
            if dt == 0:
                while dt == 0:
                    if atan(out) < x:
                        out = out + pi / (10 ** i)
                    else:
                        dt = 1
            else:
                while dt == 1:
                    if atan(out) > x:
                        out = out - pi / (10 ** i)
                    else:
                        dt = 0
            if tan(x) == out:
                break
    return (out)


def ln(x):
    out = dt = -600
    if abs(x) >= e ** 600 or x <= 0 or nan(x):
        out = float("nan")
    else:
        for i in range(16):
            if dt == -600:
                while dt == -600:
                    if e ** out < x:
                        out = out + 100 / (10 ** i)
                    else:
                        dt = 600
            else:
                while dt == 600:
                    if e ** out > x:
                        out = out - 100 / (10 ** i)
                    else:
                        dt = -600
            if e ** out == x:
                break
    return (out)


def lg(x):
    if nan(x) or x <= 0:
        out = float("nan")
    else:
        out = ln(x) / ln(10)
    return (out)


def log(x, y):
    if nan(x) or nan(y) or x == 1 or x <= 0 or y <= 0:
        out = float("nan")
    else:
        out = ln(y) / ln(x)
    return (out)


def fc(x, y):
    x = round(x, 13)
    y = round(y, 13)
    if x % 1 != 0 or y % 1 != 0 or nan(x) or nan(y):
        out = float("nan")
    elif x < y or x < 0 or y < 0:
        out = float("nan")
    else:
        x = int(x)
        y = int(y)
        out = fact(x) / (fact(x - y) * fact(y))
    return (out)


def fp(x, y):
    x = round(x, 13)
    y = round(y, 13)
    if x % 1 != 0 or y % 1 != 0 or nan(x) or nan(y):
        out = float("nan")
    elif x < y or x < 0 or y < 0:
        out = float("nan")
    else:
        x = int(x)
        y = int(y)
        out = fact(x) / fact(x - y)
    return (out)


def sinh(x):
    if nan(x):
        out = float("nan")
    else:
        out = (e ** x - e ** (-x)) / 2
    return (out)


def cosh(x):
    if nan(x):
        out = float("nan")
    else:
        out = (e ** x + e ** (-x)) / 2
    return (out)


def tanh(x):
    s = sinh(x)
    c = cosh(x)
    if nan(s) or nan(c) or nan(x):
        out = float("nan")
    else:
        out = s / c
    return (out)


def arsinh(x):
    if nan(x):
        out = float("nan")
    else:
        out = ln(x + pow(x ** 2 + 1, 0.5))
    return (out)


def arcosh(x):
    if x < 1 or nan(x):
        out = float("nan")
    else:
        out = ln(x + pow(x ** 2 - 1, 0.5))
    return (out)


def artanh(x):
    if abs(x) >= 1 or nan(x):
        out = float("nan")
    else:
        out = 0.5 * ln((-x - 1) / (x - 1))
    return (out)


def sgn(x):
    if nan(x):
        out = float("nan")
    else:
        if x == 0:
            out = 0
        else:
            out = abs(x) / x
    return (out)


def fi(x, n):
    if (x == 0 and n <= 0) or nan(x) or nan(n):
        out = float("nan")
    else:
        if x > 0:
            out = pow(x, n)
        elif x == 0:
            out = 0
        else:
            dt = k = 0
            T = 10
            while dt == 0:
                if k != 0 and (round(n * k, 10)) % 1 == 0:
                    dt = 1
                else:
                    if k >= 2 * 10 ** 5:
                        dt = 1
                    else:
                        if round(sin(n * pi + 2 * n * k * pi), 10) == 0:
                            T = sgn(cos(n * pi + 2 * n * k * pi))
                            dt = 1
                k += 1
            if T != 10:
                out = T * pow(-x, n)
            else:
                out = float("nan")
    return (out)


def times(a, b, n):
    if nan(a) or nan(b) or nan(n):
        out = [float("nan"), float("nan")]
    else:
        c = a
        d = b
        for i in range(1, n):
            oc = c
            od = d
            c = a * oc - b * od
            d = b * oc + a * od
        out = [c, d]
    return (out)


def better(x):
    global bbmdt
    bbmdt = 0
    if nan(x):
        x = "DC"
        bbmdt = 1
        print("数学错误")
    i = dt = 0
    if abs(x) > 10 ** 10:
        while abs(x) >= 10:
            i += 1
            x = x / 10
    elif abs(x) < 10 ** (-5):
        if x < 10 ** (-10):
            x = 0.0
        else:
            dt = 1
            while abs(x) < 1:
                i -= 1
                x = x * 10
    x = round(x, s)
    if x % 1 == 0:
        x = int(x)
    if x == 0:
        x = abs(x)
    if i != 0:
        i = str(i)
        if dt == 1:
            i = "(" + i + ")"
        if x == 1:
            x = "10^" + i
        else:
            x = str(x) + "*10^" + i
    x = str(x)
    return (x)


def transform(a, b, x):
    if nan(x):
        out = [float("nan")]
    else:
        if x == 0:
            if b == 0:
                out = [a, 0]
            else:
                r = pow(a ** 2 + b ** 2, 0.5)
                if r == 0:
                    out = [0, 0]
                else:
                    ct = arccos(a / r)
                    if b < 0:
                        ct = -ct
                    out = [r, ct]
        else:
            a1 = a * cos(b)
            b1 = a * sin(b)
            out = [a1, b1]
    return (out)


def pl_out(a, b, x):
    if x == 0:
        oa = better(a)
        ob = better(b) + "i"
        a = round(a, s)
        b = round(b, s)
        if a == 0:
            if b == 0:
                out = "0"
            elif b == 1:
                out = "i"
            elif b == -1:
                out = "-i"
            else:
                out = ob
        else:
            if b > 0:
                if b == 1:
                    out = oa + "+i"
                else:
                    out = oa + "+" + ob
            elif b < 0:
                if b == -1:
                    out = oa + "-i"
                else:
                    out = oa + ob
            else:
                out = oa
    else:
        oa = better(a)
        ob = better(b)
        a = round(a, s)
        b = round(b, s)
        if b == 0:
            out = oa
        elif a == 0:
            out = "0"
        else:
            out = oa + "∠" + ob
    return (out)


def f2(a, b, c, y, z):
    if nan(a) or nan(b) or nan(c):
        G = [float("nan"), float("nan")]
        D = float("nan")
    else:
        D = -b / (2 * a)
        dt = b ** 2 - 4 * a * c
        if dt > 0:
            x1 = (-b + pow(dt, 0.5)) / (2 * a)
            x2 = (-b - pow(dt, 0.5)) / (2 * a)
            G = [x1, x2]
        elif dt == 0:
            G = [D]
        else:
            xb = pow(-dt, 0.5) / (2 * a)
            G = [D, xb, -xb]
    if y == 1:
        return (G)
    elif z == 1:
        return (D)


def f3(a, b, c, d, y, z):
    if nan(a) or nan(b) or nan(c):
        G = [float("nan"), float("nan"), float("nan")]
        D = [float("nan"), float("nan")]
    else:
        kc = c
        A = pow(b, 2) - 3 * a * c
        B = b * c - 9 * a * d
        C = pow(c, 2) - 3 * b * d
        DT = pow(B, 2) - 4 * A * C
        if A == 0 and B == 0:
            G = [-b / (3 * a)]
        elif DT > 0:
            Y1 = fi(A * b + 1.5 * a * (-B + pow(DT, 0.5)), 1 / 3)
            Y2 = fi(A * b + 1.5 * a * (-B - pow(DT, 0.5)), 1 / 3)
            x1 = (-b - Y1 - Y2) / (3 * a)
            r = (-b + 0.5 * (Y1 + Y2)) / (3 * a)
            c = (pow(3, 0.5) * (Y1 - Y2)) / (6 * a)
            G = [x1, r, c, -c]
        elif DT == 0:
            K = B / A
            x1 = -b / a + K
            x2 = -K / 2
            G = [x1, x2]
        else:
            T = (2 * A * b - 3 * a * B) / (2 * pow(A ** 3, 0.5))
            ct = arccos(T)
            x1 = (-b - 2 * pow(A, 0.5) * cos(ct / 3)) / (3 * a)
            x2 = (-b + pow(A, 0.5) * (cos(ct / 3) + pow(3, 0.5) * sin(ct / 3))) / (3 * a)
            x3 = (-b + pow(A, 0.5) * (cos(ct / 3) - pow(3, 0.5) * sin(ct / 3))) / (3 * a)
            G = [x1, x2, x3]
        da = 3 * a
        db = 2 * b
        dg = f2(da, db, kc, 1, 0)
        if pow(db, 2) - 4 * da * kc > 0:
            D = [dg[0], dg[1]]
        else:
            D = []
    if y == 1:
        return (G)
    elif z == 1:
        return (D)


def inputx(x):
    global bbmdt
    bbmdt = 0
    li = ci = legal = fstr = out = ""
    l0 = fdt = strdt = legaldt = logdt = f_jump = liststr = _ = kh = khl0 = jump = fact1 = fi1 = fc1 = fp1 = 0
    if len(x) > 485:
        out = "DC"
        bbmdt = 1
        print("堆栈错误")
    elif x == "":
        out = "DC"
    else:
        for i in x:
            if i not in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'p', 'e', '(', ')', '.', ',', '^', '+',
                         '-', '*', '/', '!', 'C', 'P', 's', 'i', 'n', 'c', 'o', 't', 'a', 'h', 'r', 'l', 'g', 'b']:
                out = "DC"
                break
            elif jump != 0 and jump != 8:
                if jump == 1 and i != "i":
                    out = "DC"
                    break
                if jump == 10 and i != "n":
                    out = "DC"
                    break
                if jump == 9 and i != "s":
                    out = "DC"
                    break
                jump -= 1
            else:
                ri = i
                if (i == "*" and li == "*") or (i == "/" and li == "/"):
                    out = "DC"
                    break
                else:
                    if i == "(":
                        l0 += 1
                    elif i == ")":
                        l0 -= 1
                    elif i == "p":
                        jump = 1
                        i = "-1"
                        ri = str(pi)
                    elif i == "e":
                        ri = str(e)
                        i = "-1"
                    elif i == "A":
                        jump = 10
                        ri = str(Ans)
                        i = "-1"
                    if li in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] and i in ['s', 'c', 't', 'a', 'l', '(']:
                        ri = "*" + ri
                        ci = 1
                    if li == ")" and i == "(":
                        ri = "*" + ri
                    if i in ['s', 'c', 't', 'a', 'l'] and li == ")":
                        ci = 1
                        ri = "*" + ri
                    if li == "!" and i not in ['+', '-', '*', '/', '^', ')', 'P', 'C']:
                        ci = 1
                        ri = "*" + ri
                    if li == "-1" and i == "-1":
                        ci = 2
                        ri = "*" + ri
                    else:
                        if i == "-1" and li not in ['', '+', '-', '*', '/', '^', '(', 'P', 'C', 'n', 's', 'h', 'g']:
                            ri = "*" + ri
                        if li == "-1" and i not in ['+', '-', '*', '/', '^', ')', 'P', 'C']:
                            ri = "*" + ri
                            ci = 2
                    if strdt == 2:
                        strdt = 1
                        if i == "h":
                            fdt = 1
                            f_jump = 1
                        elif i != "(":
                            if i in ['+', '-']:
                                _ = 1
                            ri = "(" + ri
                            liststr += 1
                    if f_jump == 0:
                        if fdt == 1:
                            fdt = 0
                            if i != "(":
                                if i in ['+', '-']:
                                    _ = 1
                                if li not in ['C', 'P']:
                                    ri = "(" + ri
                                    liststr += 1
                    else:
                        f_jump = 0
                    if _ == 1 and i not in ['+', '-']:
                        _ = 0
                        if i == "(":
                            kh = 1
                    if kh == 1:
                        if i == "(":
                            khl0 += 1
                        elif i == ")":
                            khl0 -= 1
                        if kh == 0:
                            kh = 0
                            while liststr != 0:
                                liststr -= 1
                                ri = ")" + ri
                            strdt = 0
                    elif _ == 0:
                        if logdt == 1:
                            finish = ['+', '-', '*', '/', 'C', 'P', '^']
                        else:
                            finish = ['+', '-', '*', '/', 'C', 'P', ',', '^']
                        if strdt == 1 and (i in finish):
                            while liststr != 0:
                                liststr -= 1
                                ri = ")" + ri
                            strdt = 0
                    if strdt == 1 and ci == 1:
                        while liststr != 0:
                            liststr -= 1
                            ri = ")" + ri
                        strdt = logdt = 0
                    if strdt == 1 and ci == 2:
                        while liststr != 0:
                            liststr -= 1
                            ri = ")" + ri
                        strdt = logdt = 0
                    if i in ['s', 'i', 'n', 'c', 'o', 't', 'a', 'h', 'r', 'l', 'g', 'b']:
                        fstr += i
                    elif i == "P" or i == "C" or i == "^":
                        fdt = strdt = liststr = 1
                    if fstr in ['arcsin', 'arccos', 'arctan', 'arsinh', 'arcosh', 'artanh', 'lg', 'ln', 'sgn', 'abs']:
                        fstr = legal = ""
                        legaldt = 2
                        fdt = strdt = 1
                    elif fstr in ['sin', 'cos', 'tan']:
                        fstr = legal = ""
                        legaldt = strdt = 2
                    elif fstr == "log":
                        fstr = ""
                        if strdt == 1:
                            logdt = 1
                    if legaldt == 2:
                        legaldt = 0
                    elif f_jump == 0:
                        if i in ['s', 'i', 'n', 'c', 'o', 't', 'a', 'h', 'r', 'l', 'g', 'b']:
                            legal += i
                            legaldt = 1
                        elif legaldt == 1:
                            if legal not in ['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
                                             'arsinh', 'arcosh', 'artanh', 'log', 'lg', 'ln', 'sgn', 'abs']:
                                out = "DC"
                                break
                            else:
                                legaldt = 0
                                legal = ""
                    out += ri
                    if i == "!" or i == "^" or i == "C" or i == "P":
                        sn = ""
                        if i == "!":
                            sn = "(tcaf"
                            fact1 = 1
                        if i == "^":
                            sn = "(if"
                            fi1 = 1
                        elif i == "C":
                            sn = "(cf"
                            fc1 = 1
                        elif i == "P":
                            sn = "(pf"
                            fp1 = 1
                        out = out[::-1]
                        stl0 = stl1 = stdt = stfdt = 0
                        stout = ""
                        for sti in out:
                            if stdt == 0:
                                if sti == i and stl0 == 0:
                                    stl0 = 1
                                    if sti == "!":
                                        sti = ")"
                                    else:
                                        sti = ","
                                elif stl0 == 1:
                                    if sti == ")":
                                        stl0 = 2
                                        stl1 = 1
                                    else:
                                        stl0 = 3
                                elif stl0 == 2:
                                    if sti == ")":
                                        stl1 += 1
                                    elif sti == "(":
                                        stl1 -= 1
                                    if stl1 == 0:
                                        stdt = stfdt = 1
                                elif stl0 == 3:
                                    if sti in ['+', '-', '*', '/', '(', ',']:
                                        stdt = 1
                                        sti = sn + sti
                            elif stdt == 1 and stfdt == 1:
                                if sti not in ['s', 'i', 'n', 'c', 'o', 't', 'a', 'h', 'r', 'l', 'g', 'b', 'f', 'p']:
                                    sti = sn + sti
                                    stfdt = 0
                            stout += sti
                        if stdt == 0 or stfdt == 1:
                            stout += sn
                        out = stout[::-1]
                    li = i
                    ci = ""
    if out != "DC":
        if (legaldt == 1) and (
                legal not in ['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'arsinh',
                              'arcosh', 'artanh', 'log', 'lg', 'ln', 'sgn', 'abs']):
            out = tout = "DC"
        else:
            if strdt == 1:
                while liststr != 0:
                    liststr -= 1
                    out += ")"
            if l0 != 0:
                if l0 > 0:
                    for i in range(0, abs(l0)):
                        out += ")"
                else:
                    for i in range(0, abs(l0)):
                        out = "(" + out
            tout = out
            tout = tout.replace(str(pi), "pi")
            tout = tout.replace(str(e), "e")
            tout = tout.replace("fi", "pow")
            try:
                out = eval(out)
                if nan(float(str(out))):
                    bbmdt = 1
                    out = tout = "DC"
                    print("数学错误")
            except:
                out = tout = "DC"
    else:
        tout = "DC"
    return ([str(out), tout, fact1, fi1, fc1, fp1])


pi = e = lock = Ans = bbmdt = 0
s = DTfop = DTop = DTip = first = 3
mode = ai = "b2"
aic1 = aic2 = aiv1 = "0"
for i in range(11):
    pi = pi + pow(-1, i) * (16 / ((2 * i + 1) * pow(5, 2 * i + 1)) - 4 / ((2 * i + 1) * pow(239, 2 * i + 1)))
for i in range(18):
    e = e + 1 / fact(i)
print("———————————D-Calculator———————————")
while True:
    if lock == 0:
        if first == 0:
            if ai == "b2":
                mode = input("请选择模式(输入'b2'查看菜单):")
            else:
                mode = input(f"请选择模式(输入'b2'查看菜单;回车进入模式'{ai}'):")
        elif first == 2:
            mode = input("请选择模式:")
            first = 0
    if mode == "":
        if ai == "b2":
            print("暂不支持模式:''")
            print("—————————————————————————————————")
        else:
            mode = ai
            lock = 1
    elif mode == "b1":
        print("感谢使用")
        print("—————————————————————————————————")
        exit()
    elif mode == "b2":
        if first != 3:
            print("—————————————————————————————————")
            print("菜单:")
        print("一.非运算模式:")
        print("—————基本功能—————")
        print("    模式'b1':退出程序")
        print("    模式'b2':菜单")
        print("    模式'b3':说明")
        print("—————设置—————")
        print("    模式's1':保留小数位数设置")
        print("    模式's2':复数输入设置")
        print("    模式's3':复数输出设置")
        print("    模式's4':函数输出设置")
        print("二.运算模式:")
        print("—————实数运算—————")
        print("    模式'r1':实数的基本运算")
        print("—————复数运算—————")
        print("    模式'c1':复数不同形式转化")
        print("    模式'c2':两个复数的四则运算")
        print("    模式'c3':复数的整数次方计算")
        print("    模式'c4':复数的复数次方计算")
        print("    模式'c5':复数的非零整数次方根计算")
        print("—————多项式函数分析—————")
        print("    模式'f1':一次函数分析")
        print("    模式'f2':二次函数分析")
        print("    模式'f3':三次函数分析")
        print("    模式'f4':四次函数分析")
        print("—————向量运算—————")
        print("    模式'v1':两个向量的加＆减法运算")
        print("    模式'v2':向量的数乘运算")
        print("    模式'v3':两个向量的内积")
        print("    模式'v4':两个向量的外积")
        print("    模式'v5':向量的模长计算")
        print("    模式'v6':求与已知向量同向的单位向量")
        print("    模式'v7':两个向量形成的角")
        print("    模式'v8':投影及投影向量")
        print("—————————————————————————————————")
        first = 2
    elif mode == "b3":
        print("—————————————————————————————————")
        print("说明:")
        print("  角度单位均为弧度制")
        print("  常数:pi(圆周率;π);e(自然常数);i(虚数单位;i^2=-1)")
        print("  结果默认保留3位小数")
        print("  函数运算默认保留复数结果")
        print("  复数输入及输出默认为一般形式(通式均输出为极坐标形式)")
        print("  若输出结果不正常,可能是由于输出值为近似值或输入值超出可计算范围")
        print("  部分输入提示范围是输入要求的必要不充分条件")
        print("  所有输入的表达式均在实数范围内运算")
        print("  多项式函数分析输出的最大值或最小值可能为局部最大值或局部最小值")
        print("  Ans为上一次运行结果,其值默认为0,仅模式'r1'会更改Ans的值")
        print("  支持输入的符号集如下:")
        print("  数字及常数:{0，1，2，3，4，5，6，7，8，9，pi，e，Ans}")
        print("  运算符:{.，,，^，+，-，*，/，(，)，!，C，P}")
        print("  三角学函数:{sin，cos，tan，arcsin，arccos，arctan，sinh，cosh，tanh，arsinh，arcosh，artanh}")
        print("  其它函数:{log(，lg，ln，abs，sgn}")
        print("  仅模式选择时允许输入:{b，s，r，c，f，v}")
        print("  支持输入的函数及其定义域与输入格式:")
        print("  sin(x):x∈R ＆ cos(x):x∈R ＆ tan(x):x∈{x|x≠(0.5+K)*pi,K∈Z}∩R")
        print("  arcsin(x):x∈[-1,1] ＆ arccos(x):x∈[-1,1] ＆ arctan(x):x∈R")
        print("  sinh(x):x∈R ＆ cosh(x):x∈R ＆ tanh(x):x∈R")
        print("  arsinh(x):x∈R ＆ arcosh(x):x∈[1,+∞) ＆ artanh(x):x∈(-1,1)")
        print("  log(x,y):x为底数,x∈(0,1)∪(1,+∞);y为真数,y>0 ＆ lg(x):x>0 ＆ ln(x):x>0")
        print("  排列数:(n)P(m)其中m,n∈N;m≤n ＆ 组合数:(n)C(m)其中m,n∈N;m≤n")
        print("  绝对值:abs(x)其中x∈R ＆ 符号函数:sgn(x)其中x∈R")
        print("—————————————————————————————————")
    elif mode == "s1":
        try:
            print("——————————输入小数位数设置——————————")
            print(f"[注:当前保留 {s} 位小数]")
            ks = float(inputx(input("请输入保留小数位数n(n∈[1,9]∩Z):"))[0])
            if ks % 1 == 0:
                ks = int(ks)
                if ks < 1 or ks > 9:
                    print("范围错误")
                    print("设置失败")
                else:
                    s = ks
                    print(f"设置成功,当前保留 {s} 位小数")
            else:
                print("数学错误")
                print("设置失败")
        except:
            if bbmdt == 0:
                print("语法错误")
            print("设置失败")
        print("—————————————————————————————————")
    elif mode == "s2":
        print("—————————————复数输入形式设置—————————————")
        print("复数输入形式's21':一般形式(a+bi:a,b∈R)")
        print("复数输入形式's22':极坐标形式(r∠θ:r∈[0,+∞);θ∈R)")
        if DTip == 3:
            ip = "s21"
        else:
            ip = "s22"
        print(f"[注:当前为 '{ip}' 模式]")
        ip = input("请选择复数输入形式:")
        if ip == "s21":
            DTip = 3
            print("设置成功,复数输入为一般形式")
        elif ip == "s22":
            DTip = 4
            print("设置成功,复数输入为极坐标形式")
        else:
            print("设置失败")
        print("—————————————————————————————————")
    elif mode == "s3":
        print("—————————————复数输出形式设置—————————————")
        print("复数输出形式's31':一般形式(a+bi:a,b∈R)")
        print("复数输出形式's32':极坐标形式(r∠θ:r∈[0,+∞);abs(θ)∈(0,pi))")
        if DTop == 3:
            ip = "s31"
        else:
            ip = "s32"
        print(f"[注:当前为 '{ip}' 模式]")
        ip = input("请选择复数输出形式:")
        if ip == "s31":
            DTop = 3
            print("设置成功,复数输出为一般形式(通式除外)")
        elif ip == "s32":
            DTop = 4
            print("设置成功,复数输出为极坐标形式")
        else:
            print("设置失败")
        print("—————————————————————————————————")
    elif mode == "s4":
        print("—————————————函数输出形式设置—————————————")
        print("函数输出形式's41':保留复数结果")
        print("函数输出形式's42':隐藏复数结果")
        if DTfop == 3:
            ip = "s41"
        else:
            ip = "s42"
        print(f"[注:当前为 '{ip}' 模式]")
        ip = input("请选择函数输出形式:")
        if ip == "s41":
            DTfop = 3
            print("设置成功,函数运算保留复数结果")
        elif ip == "s42":
            DTfop = 4
            print("设置成功,函数运算隐藏复数结果")
        else:
            print("设置失败")
        print("—————————————————————————————————")
    elif mode == "r1":
        print("————————————实数的基本运算————————————")
        try:
            expression = inputx(input("请输入表达式:"))
            x = better(float(expression[0]))
            if expression[2] == 1 or expression[3] == 1 or expression[4] == 1 or expression[5] == 1:
                amount = expression[2] + expression[3] + expression[4] + expression[5]
                print("[注:", end="")
                if expression[2] == 1:
                    print("fact(x)=x!", end="")
                    amount -= 1
                    if amount == 0:
                        print("]")
                    else:
                        print(",", end="")
                if expression[3] == 1:
                    print("pow(a,b)=a^b", end="")
                    amount -= 1
                    if amount == 0:
                        print("]")
                    else:
                        print(",", end="")
                if expression[4] == 1:
                    print("fc(a,b)=(a)C(b)", end="")
                    amount -= 1
                    if amount == 0:
                        print("]")
                    else:
                        print(",", end="")
                if expression[5] == 1:
                    print("fp(a,b)=(a)P(b)]")
            print(f"原式=", expression[1])
            Ans = float(expression[0])
            print("计算结果:", x)
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "r1"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "c1":
        try:
            dtc1 = 0
            print("—————————复数不同形式转化—————————")
            print("  子模式'c11':复数一般形式转化为极坐标形式")
            print("  子模式'c12':复数极坐标形式转化为一般形式")
            if aic1 == "0":
                sonmode = input("  请选择子模式:")
            else:
                sonmode = input(f"  请选择子模式(回车子模式'{aic1}'):")
            if sonmode == "":
                if aic1 != "0":
                    sonmode = aic1
                else:
                    print("  暂不支持子模式:''")
                    dtc1 = 1
            if sonmode == "c11":
                aic1 = "c11"
                print("——————Z=a+bi▶Z=a∠α——————")
                print("—————————a,b∈R—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("b="))[0])
                o1 = pl_out(a, b, 0)
                tf = transform(a, b, 0)
                o2 = pl_out(tf[0], tf[1], 1)
                print(f"{o1}= {o2}")
            elif sonmode == "c12":
                aic1 = "c12"
                print("————————Z=a∠α▶Z=a+bi————————")
                print("—————————a∈[0,+∞);α∈R—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("α="))[0])
                if a < 0:
                    print("数学错误")
                else:
                    o1 = pl_out(a, b, 1)
                    tf = transform(a, b, 1)
                    o2 = pl_out(tf[0], tf[1], 0)
                    print(f"{o1}= {o2}")
            else:
                if dtc1 == 0:
                    print(f"  不支持模式:'{sonmode}'")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "c1"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "c2":
        dt234 = 0
        dtc2 = 0
        try:
            print("——————两个复数的四则运算——————")
            print("  子模式'c21':两个复数的加法运算")
            print("  子模式'c22':两个复数的减法运算")
            print("  子模式'c23':两个复数的乘法运算")
            print("  子模式'c24':两个复数的除法运算")
            if aic2 == "0":
                sonmode = input("  请选择子模式:")
            else:
                sonmode = input(f"  请选择子模式(回车进入子模式'{aic2}'):")
            if sonmode == "":
                if aic2 != "0":
                    sonmode = aic2
                else:
                    dtc2 = 1
            if sonmode not in ['c21', 'c22', 'c23', 'c24']:
                if dtc2 == 0:
                    print(f"  不支持子模式:'{sonmode}'")
                else:
                    print(f"  暂不支持子模式:''")
            else:
                if DTip == 3:
                    if sonmode == "c21":
                        print("——————已选择加法运算:(a+bi)+(c+di)——————")
                    elif sonmode == "c22":
                        print("——————已选择减法运算:(a+bi)-(c+di)——————")
                    elif sonmode == "c23":
                        print("——————已选择乘法运算:(a+bi)*(c+di)——————")
                    else:
                        print("——————已选择除法运算:(a+bi)/(c+di)——————")
                    print("—————————a,b,c,d∈R—————————")
                    aic2 = sonmode
                    a = float(inputx(input("a="))[0])
                    b = float(inputx(input("b="))[0])
                    c = float(inputx(input("c="))[0])
                    d = float(inputx(input("d="))[0])
                    o1 = pl_out(a, b, 0)
                    o11 = pl_out(c, d, 0)
                    if sonmode == "c21" or sonmode == "c22":
                        if c == 0 and d < 0:
                            o11 = "(" + o11 + ")"
                        elif c < 0:
                            o11 = "(" + o11 + ")"
                    elif sonmode == "c23":
                        if a != 0 and b != 0:
                            o1 = "(" + o1 + ")"
                        if c != 0 and d != 0:
                            o11 = "(" + o11 + ")"
                        elif c == 0 and d < 0:
                            o11 = "(" + o11 + ")"
                        elif c < 0:
                            o11 = "(" + o11 + ")"
                    else:
                        if a != 0 and b != 0:
                            o1 = "(" + o1 + ")"
                        if c != 0 and d != 0:
                            o11 = "(" + o11 + ")"
                        elif c == 0:
                            o11 = "(" + o11 + ")"
                        elif c < 0:
                            o11 = "(" + o11 + ")"
                else:
                    if sonmode == "c21":
                        print("——————已选择加法运算:a∠α+b∠β——————")
                    elif sonmode == "c22":
                        print("——————已选择减法运算:a∠α-b∠β——————")
                    elif sonmode == "c23":
                        print("——————已选择乘法运算:a∠α*b∠β——————")
                    else:
                        print("——————已选择除法运算:a∠α/b∠β——————")
                    aic2 = sonmode
                    print("—————————a,b∈[0,+∞);α,β∈R—————————")
                    a = float(inputx(input("a="))[0])
                    b = float(inputx(input("α="))[0])
                    c = float(inputx(input("b="))[0])
                    d = float(inputx(input("β="))[0])
                    o1 = pl_out(a, b, 1)
                    o11 = pl_out(c, d, 1)
                    if a < 0 or c < 0:
                        print("数学错误")
                        dt234 = 1
                    else:
                        tf = transform(a, b, 1)
                        a = tf[0]
                        b = tf[1]
                        tf = transform(c, d, 1)
                        c = tf[0]
                        d = tf[1]
                if dt234 == 0:
                    if sonmode == "c21":
                        n = "+"
                        oa = a + c
                        ob = b + d
                    elif sonmode == "c22":
                        n = "-"
                        oa = a - c
                        ob = b - d
                    elif sonmode == "c23":
                        n = "*"
                        oa = a * c - b * d
                        ob = b * c + a * d
                    else:
                        n = "/"
                        if abs(c) + abs(d) == 0:
                            print("数学错误")
                            dt234 = oa = ob = 1
                        else:
                            r = c ** 2 + d ** 2
                            oa = (a * c + b * d) / r
                            ob = (b * c - a * d) / r
                    if dt234 == 0:
                        if DTop == 3:
                            o2 = pl_out(oa, ob, 0)
                            print(f"{o1}{n}{o11}={o2}")
                        else:
                            tf = transform(oa, ob, 0)
                            o2 = pl_out(tf[0], tf[1], 1)
                            print(f"{o1}{n}{o11}={o2}")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "c2"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "c3":
        dt244 = 0
        try:
            if DTip == 3:
                print("——————复数Z=a+bi的n次方计算——————")
                print("—————————a,b∈R;n∈Z—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("b="))[0])
                n = float(inputx(input("n="))[0])
                if n % 1 != 0:
                    print("数学错误")
                    dt244 = 1
                o1 = pl_out(a, b, 0)
            else:
                print("——————复数Z=a∠α的n次方计算——————")
                print("—————————a∈[0,+∞);α∈R;n∈Z—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("α="))[0])
                n = float(inputx(input("n="))[0])
                o1 = pl_out(a, b, 1)
                if a < 0 or n % 1 != 0:
                    print("数学错误")
                    dt244 = 1
                else:
                    tf = transform(a, b, 1)
                    a = tf[0]
                    b = tf[1]
            if dt244 == 0:
                n = int(n)
                r = abs(a) + abs(b)
                if r == 0 and n <= 0:
                    print("数学错误")
                else:
                    if n == 0:
                        print(o1, "的", "0", "次方为", "1")
                    else:
                        x = times(a, b, abs(n))
                        a1 = x[0]
                        b1 = x[1]
                        if n < 0:
                            r = a1 ** 2 + b1 ** 2
                            a1 = a1 / r
                            b1 = -b1 / r
                        if DTop == 3:
                            o2 = pl_out(a1, b1, 0)
                        else:
                            tf = transform(a1, b1, 0)
                            o2 = pl_out(tf[0], tf[1], 1)
                        print(o1, "的", better(n), "次方为", o2)
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "c3"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "c4":
        dt235 = 0
        try:
            if DTip == 3:
                print("——————复数Z=a+bi的ω=c+di次方计算——————")
                print("—————————a,b,c∈R;d∈R*—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("b="))[0])
                c = float(inputx(input("c="))[0])
                d = float(inputx(input("d="))[0])
                o1 = pl_out(a, b, 0)
                o11 = pl_out(c, d, 0)
                if d == 0:
                    print("数学错误")
                    dt235 = 1
            else:
                print("——————复数Z=a∠α的ω=b∠β次方计算——————")
                print("—————————a∈[0,+∞);b∈(0,+∞);α∈R;β∈{x|x≠K*pi,K∈Z}∩R—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("α="))[0])
                c = float(inputx(input("b="))[0])
                d = float(inputx(input("β="))[0])
                o1 = pl_out(a, b, 1)
                o11 = pl_out(c, d, 1)
                if a < 0 or c <= 0:
                    print("数学错误")
                    dt235 = 1
                else:
                    tf = transform(a, b, 1)
                    a = tf[0]
                    b = tf[1]
                    tf = transform(c, d, 1)
                    c = tf[0]
                    d = tf[1]
                    if d == 0:
                        print("数学错误")
                        dt235 = 1
            if dt235 == 0:
                dtct = 0
                r = pow(a ** 2 + b ** 2, 0.5)
                if r == 0:
                    print(o1, "的", o11, "次方为", "0")
                else:
                    arg = arccos(a / r)
                    if b < 0:
                        arg = -arg
                    ro = (r ** c) / (e ** (d * arg))
                    ct = d * ln(r) + c * arg
                    oa = ro * cos(ct)
                    ob = ro * sin(ct)
                    d2 = -2 * d
                    ok = 2 * c * pi
                    if nan(d2) or nan(ct) or nan(ro) or nan(ok):
                        print("数学错误")
                    else:
                        print(o1, "的", o11, "次方为:")
                        print("通式:Z(K)=", end="")
                        if c % 1 == 0:
                            if sin(ct) == 0:
                                dtct = 1
                                if cos(ct) == -1:
                                    print("-", end="")
                        if abs(d2) != 1:
                            if ro == 1:
                                print(f"{round(e ** pi, s)}^({better(d2)}K)", end="")
                            else:
                                print(f"{better(ro)}*{round(e ** pi, s)}^({better(d2)}K)", end="")
                        else:
                            if d2 == 1:
                                if ro == 1:
                                    print(f"{round(e ** pi, s)}^K", end="")
                                else:
                                    print(f"{better(ro)}*{round(e ** pi, s)}^K", end="")
                            else:
                                if ro == 1:
                                    print(f"{round(e ** pi, s)}^(-K)", end="")
                                else:
                                    print(f"{better(ro)}*{round(e ** pi, s)}^(-K)", end="")
                        if dtct == 1:
                            print(",K∈Z")
                        else:
                            print("∠", end="")
                            if c % 1 == 0:
                                print(f"{better(ct)},K∈Z")
                            else:
                                if ct == 0:
                                    if ok == 1:
                                        print("K,K∈Z")
                                    elif ok == -1:
                                        print("-K,K∈Z")
                                    else:
                                        print(f"{better(ok)}K,K∈Z")
                                else:
                                    if ok > 0:
                                        if ok == 1:
                                            print(f"({better(ct)}+K),K∈Z")
                                        else:
                                            print(f"({better(ct)}+{better(ok)}K),K∈Z")
                                    elif ok < 0:
                                        if ok == -1:
                                            print(f"({better(ct)}-K),K∈Z")
                                        else:
                                            print(f"({better(ct)}{better(ok)}K),K∈Z")
                        print("特别地,当K=0时:")
                        print("Z(0)=", end=" ")
                        if DTop == 3:
                            o2 = pl_out(oa, ob, 0)
                        else:
                            tf = transform(oa, ob, 0)
                            o2 = pl_out(tf[0], tf[1], 1)
                        print(o2)
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "c4"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "c5":
        dt236 = 0
        try:
            if DTip == 3:
                print("——————复数Z=a+bi的n次方根计算——————")
                print("—————————a,b∈R;n∈Z*—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("b="))[0])
                n = float(inputx(input("n="))[0])
                o1 = pl_out(a, b, 0)
                if n == 0 or n % 1 != 0:
                    print("数学错误")
                    dt236 = 1
            else:
                print("——————复数Z=a∠α的n次方根计算——————")
                print("—————————a,α∈R;n∈Z*—————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("α="))[0])
                n = float(inputx(input("n="))[0])
                o1 = pl_out(a, b, 1)
                if a < 0 or n == 0 or n % 1 != 0:
                    print("数学错误")
                    dt236 = 1
                else:
                    tf = transform(a, b, 1)
                    a = tf[0]
                    b = tf[1]
            if dt236 == 0:
                n = int(n)
                n1 = n
                n = abs(n)
                Dr = pow(a, 2) + pow(b, 2)
                if Dr == 0:
                    if n1 <= 0:
                        print("数学错误")
                    else:
                        print("0", "的", better(n1), "次方根为 0")
                else:
                    if n1 < 0:
                        a = a / Dr
                        b = -b / Dr
                    r = pow(pow(a, 2) + pow(b, 2), 0.5)
                    arg = arccos(a / r)
                    if b < 0:
                        arg = 2 * pi - arg
                    rn = pow(r, 1 / n)
                    if nan(rn) or nan(n) or nan(arg):
                        print("数学错误")
                    else:
                        print(o1, "的", better(n1), "次方根为:")
                        if n != 1:
                            print(f"通式:Z(K+1)={better(rn)}", end="∠")
                            if arg == 0:
                                if n % 2 == 0:
                                    if n / 2 == 1:
                                        print(f"({round(pi, s)}K),K∈[0,{better(n - 1)}]∩Z")
                                    else:
                                        print(f"({round(pi, s)}K/{better(n / 2)}),K∈[0,{better(n - 1)}]∩Z")
                                else:
                                    print(f"({round(pi * 2, s)}K/{better(n)}),K∈[0,{better(n - 1)}]∩Z")
                            else:
                                if n % 2 == 0 and arg % 2 == 0:
                                    if n / 2 == 1:
                                        print(f"({better(arg / 2)}+{round(pi, s)}K),K∈[0,{better(n - 1)}]∩Z")
                                    else:
                                        print(
                                            f"(({better(arg / 2)}+{round(pi, s)}K)/{better(n / 2)}),K∈[0,{better(n - 1)}]∩Z")
                                else:
                                    print(f"(({better(arg)}+{round(pi * 2, s)}K)/{better(n)}),K∈[0,{better(n - 1)}]∩Z")
                        if n > 100:
                            try:
                                print("即将输出", better(n), "个结果,是否全部输出?")
                                bh = input(f"回车输出全部结果,否则请输入输出结果数n(n∈[1,{n - 1}]∩Z):")
                                if bh == "":
                                    nn = n
                                    print(f"全部结果(共{nn}个)如下:")
                                else:
                                    bh = float(inputx(bh)[0])
                                    if bh < 1 or bh > n - 1:
                                        print("范围错误")
                                        print("输入值无效,前99个结果如下:")
                                        nn = 99
                                    else:
                                        if bh % 1 != 0:
                                            print("数学错误")
                                            print("输入值无效,前99个结果如下:")
                                            nn = 99
                                        else:
                                            bh = int(bh)
                                            nn = bh
                                            print(f"前{better(nn)}个结果如下:")
                            except:
                                if bbmdt == 0:
                                    print("语法错误")
                                print("输入值无效,前99个结果如下:")
                                nn = 99
                        else:
                            nn = n
                            print(f"全部结果(共{nn}个)如下:")
                        for k in range(0, nn):
                            an = rn * cos((2 * pi * k + arg) / n)
                            bn = rn * sin((2 * pi * k + arg) / n)
                            oZ = "Z(" + str(k + 1) + ")="
                            print(oZ, end="")
                            if DTop == 3:
                                o2 = pl_out(an, bn, 0)
                            else:
                                tf = transform(an, bn, 0)
                                o2 = pl_out(tf[0], tf[1], 1)
                            print(o2)
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "c5"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "f1":
        try:
            print("—————————y=f(x)=ax+b—————————")
            print("—————————a∈R*;b∈R—————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            if a == 0:
                print("数学错误")
            else:
                if a == 1:
                    print("[y=f(x)=x", end="")
                elif a == -1:
                    print("[y=f(x)=-x", end="")
                else:
                    print(f"[y=f(x)={better(a)}x", end="")
                if b > 0:
                    print(f"+{better(b)}]")
                elif b < 0:
                    print(f"{better(b)}]")
                else:
                    print("]")
                print("定义域: R")
                print("值域: R")
                if a > 0:
                    print("增区间: R")
                    print("减区间: 无")
                else:
                    print("增区间: 无")
                    print("减区间: R")
                print("凹区间: 无")
                print("凸区间: 无")
                print("极大值点: 无")
                print("极小值点: 无")
                print("拐点: 无")
                x0 = -b / a
                print("f(0)=", better(b))
                print(f"方程y=f(x)=0的根: x={better(x0)}")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "f1"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "f2":
        dt11 = 0
        try:
            print("—————————y=f(x)=ax^2+bx+c—————————")
            print("—————————a∈R*;b,c∈R—————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            c = float(inputx(input("c="))[0])
            if a == 0:
                print("数学错误")
            else:
                if a == 1:
                    print("[y=f(x)=x^2", end="")
                elif a == -1:
                    print("[y=f(x)=-x^2", end="")
                else:
                    print(f"[y=f(x)={better(a)}x^2", end="")
                if b > 0:
                    if b == 1:
                        print("+x", end="")
                    else:
                        print(f"+{better(b)}x", end="")
                elif b < 0:
                    if b == -1:
                        print("-x", end="")
                    else:
                        print(f"{better(b)}x", end="")
                if c > 0:
                    print(f"+{better(c)}]")
                elif c < 0:
                    print(f"{better(c)}]")
                else:
                    print("]")
            print("定义域: R")
            xorn = (4 * a * c - b ** 2) / (4 * a)
            if a > 0:
                print(f"值域: [{better(xorn)},+∞)")
            else:
                print(f"值域: (-∞,{better(xorn)}]")
            z = f2(a, b, c, 0, 1)
            xa = f2(a, b, c, 1, 0)
            if a < 0:
                print(f"增区间: (-∞,{better(z)})")
                print(f"减区间: ({better(z)},+∞)")
                print("凹区间: 无")
                print("凸区间: R")
                print(f"极大值点: ({better(z)},{better(xorn)})")
                print("极小值点: 无")
            else:
                print(f"增区间: ({better(z)},+∞)")
                print(f"减区间: (-∞,{better(z)})")
                print("凹区间: R")
                print("凸区间: 无")
                print("极大值点: 无")
                print(f"极小值点: ({better(z)},{better(xorn)})")
            print("拐点: 无")
            print("f(0)=", round(c, s))
            print("方程y=f(x)=0的根:", end="")
            if len(xa) == 1:
                print(f"x={better(xa[0])}")
            elif len(xa) == 2:
                print(f"x={better(xa[0])}", end=" ∨ ")
                print(f"x={better(xa[1])}")
            else:
                if DTfop == 3:
                    c1a = c2a = xa[0]
                    c1b = xa[1]
                    c2b = xa[2]
                    if DTop == 3:
                        o1 = pl_out(c1a, c1b, 0)
                        o2 = pl_out(c2a, c2b, 0)
                    else:
                        tf1 = transform(c1a, c1b, 0)
                        tf2 = transform(c2a, c2b, 0)
                        o1 = pl_out(tf1[0], tf1[1], 1)
                        o2 = pl_out(tf2[0], tf2[1], 1)
                    print(f"x={o1}", "∨", f"x={o2}")
                else:
                    print("方程无实数根")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "f2"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "f3":
        dt12 = 0
        try:
            print("—————————y=f(x)=ax^3+bx^2+cx+d—————————")
            print("—————————a∈R*;b,c,d∈R—————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            c = float(inputx(input("c="))[0])
            d = float(inputx(input("d="))[0])
            if a == 0:
                print("数学错误")
            else:
                if a == 1:
                    print("[y=f(x)=x^3", end="")
                elif a == -1:
                    print("[y=f(x)=-x^3", end="")
                else:
                    print(f"[y=f(x)={better(a)}x^3", end="")
                if b > 0:
                    if b == 1:
                        print("+x^2", end="")
                    else:
                        print(f"+{better(b)}x^2", end="")
                elif b < 0:
                    if b == -1:
                        print("-x^2", end="")
                    else:
                        print(f"{better(b)}x^2", end="")
                if c > 0:
                    if c == 1:
                        print("+x", end="")
                    else:
                        print(f"+{better(c)}x", end="")
                elif c < 0:
                    if c == -1:
                        print("-x", end="")
                    else:
                        print(f"{better(c)}x", end="")
                if d > 0:
                    print(f"+{better(d)}]")
                elif d < 0:
                    print(f"{better(d)}]")
                else:
                    print("]")
                print("定义域: R")
                print("值域: R")
                G = f3(a, b, c, d, 1, 0)
                D = f3(a, b, c, d, 0, 1)
                D.sort()
                if a > 0:
                    if len(D) == 0:
                        print("增区间: R")
                        print("减区间: 无")
                    else:
                        print(f"增区间: (-∞,{better(D[0])})", ",", f"({better(D[1])},+∞)")
                        print(f"减区间: ({better(D[0])},{better(D[1])})")
                else:
                    if len(D) == 0:
                        print("增区间: 无")
                        print("减区间: R")
                    else:
                        print(f"增区间: ({better(D[0])},{better(D[1])})")
                        print(f"增区间: (-∞,{better(D[0])})", ",", f"({better(D[1])},+∞)")
                ddx = -b / (3 * a)
                if a > 0:
                    print(f"凹区间: ({better(ddx)},+∞)")
                    print(f"凸区间: (-∞,{better(ddx)})")
                else:
                    print(f"凹区间: (-∞,{better(ddx)})")
                    print(f"凸区间: ({better(ddx)},+∞)")
                if len(D) == 0:
                    print("极大值点: 无")
                    print("极小值点: 无")
                else:
                    yDd0 = a * D[0] ** 3 + b * D[0] ** 2 + c * D[0] + d
                    yDd1 = a * D[1] ** 3 + b * D[1] ** 2 + c * D[1] + d
                    if a > 0:
                        print(f"极大值点: ({better(D[0])},{better(yDd0)})")
                        print(f"极小值点: ({better(D[1])},{better(yDd1)})")
                    else:
                        print(f"极大值点: ({better(D[1])},{better(yDd1)})")
                        print(f"极小值点: ({better(D[0])},{better(yDd0)})")
                fgd = a * ddx ** 3 + b * ddx ** 2 + c * ddx + d
                print(f"拐点: ({better(ddx)},{better(fgd)})")
                print("f(0)=", better(d))
                print("方程y=f(x)=0的根:", end="")
                if len(G) == 1:
                    print("x=", better(G[0]))
                elif len(G) == 2:
                    print(f"x={better(G[0])}", end=" ∨ ")
                    print(f"x={better(G[1])}")
                elif len(G) == 3:
                    print(f"x={better(G[0])}", end=" ∨ ")
                    print(f"x={better(G[1])}", end=" ∨ ")
                    print(f"x={better(G[2])}")
                else:
                    print(f"x={better(G[0])}", end=" ")
                    if DTfop == 3:
                        ca1 = ca2 = G[1]
                        cb1 = G[2]
                        cb2 = G[3]
                        if DTop == 3:
                            o1 = pl_out(ca1, cb1, 0)
                            o2 = pl_out(ca2, cb2, 0)
                        else:
                            tf1 = transform(ca1, cb1, 0)
                            tf2 = transform(ca2, cb2, 0)
                            o1 = pl_out(tf1[0], tf1[1], 1)
                            o2 = pl_out(tf2[0], tf2[1], 1)
                        print("∨ x=" + o1, "∨", "x=" + o2)
                    else:
                        print("其余根为复数")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "f3"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "f4":
        try:
            print("—————————y=f(x)=ax^4+bx^3+cx^2+dx+f—————————")
            print("—————————a∈R*;b,c,d,f∈R—————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            c = float(inputx(input("c="))[0])
            d = float(inputx(input("d="))[0])
            f = float(inputx(input("f="))[0])
            if a == 0:
                print("数学错误")
            else:
                if a == 1:
                    print("[y=f(x)=x^4", end="")
                elif a == -1:
                    print("[y=f(x)=-x^4", end="")
                else:
                    print(f"[y=f(x)={better(a)}x^4", end="")
                if b > 0:
                    if b == 1:
                        print("+x^3", end="")
                    else:
                        print(f"+{better(b)}x^3", end="")
                elif b < 0:
                    if b == -1:
                        print("-x^3", end="")
                    else:
                        print(f"{better(b)}x^3", end="")
                if c > 0:
                    if c == 1:
                        print("+x^2", end="")
                    else:
                        print(f"+{better(c)}x^2", end="")
                elif c < 0:
                    if c == -1:
                        print("-x^2", end="")
                    else:
                        print(f"{better(c)}x^2", end="")
                if d > 0:
                    if d == 1:
                        print("+x", end="")
                    else:
                        print(f"+{better(d)}x", end="")
                elif d < 0:
                    if d == -1:
                        print("-x", end="")
                    else:
                        print(f"{better(d)}x", end="")
                if f > 0:
                    print(f"+{better(f)}]")
                elif f < 0:
                    print(f"{better(f)}]")
                else:
                    print("]")
                da = 4 * a
                db = 3 * b
                dc = 2 * c
                dG = f3(da, db, dc, d, 1, 0)
                if len(dG) == 4 or len(dG) == 1:
                    D = [dG[0]]
                elif len(dG) == 3:
                    D = [dG[0], dG[1], dG[2]]
                else:
                    dG.sort()
                    dg1 = dG[0]
                    dg2 = dG[1]
                    avdg = (dg1 + dg2) / 2
                    dgs = dg1 - avdg
                    dgm = dg2 + avdg
                    dfdgs = da * pow(dgs, 3) + db * pow(dgs, 2) + dc * dgs + d
                    dfdgm = da * pow(dgm, 3) + db * pow(dgm, 2) + dc * dgm + d
                    dfavdg = da * pow(avdg, 3) + db * pow(avdg, 2) + dc * avdg + d
                    if dfdgs * dfavdg > 0:
                        D = [dfdgm]
                    else:
                        D = [dfdgs]
                D.sort()
                print("定义域: R")
                if a > 0:
                    if len(D) == 1:
                        fxorn = D[0]
                        xorn = a * fxorn ** 4 + b * fxorn ** 3 + c * fxorn ** 2 + d * fxorn + f
                    else:
                        fxorn1 = D[0]
                        fxorn2 = D[1]
                        fxorn3 = D[2]
                        xorn1 = a * pow(fxorn1, 4) + b * pow(fxorn1, 3) + c * pow(fxorn1, 2) + d * fxorn1 + f
                        xorn2 = a * pow(fxorn2, 4) + b * pow(fxorn2, 3) + c * pow(fxorn2, 2) + d * fxorn2 + f
                        xorn3 = a * pow(fxorn3, 4) + b * pow(fxorn3, 3) + c * pow(fxorn3, 2) + d * fxorn3 + f
                        xorn = min([xorn1, xorn2, xorn3])
                    print(f"值域: [{better(xorn)},+∞)")
                else:
                    if len(D) == 1:
                        fxorn = D[0]
                        xorn = a * fxorn ** 4 + b * fxorn ** 3 + c * fxorn ** 2 + d * fxorn + f
                    else:
                        fxorn1 = D[0]
                        fxorn2 = D[1]
                        fxorn3 = D[2]
                        xorn1 = a * fxorn1 ** 4 + b * fxorn1 ** 3 + c * fxorn1 ** 2 + d * fxorn1 + f
                        xorn2 = a * fxorn2 ** 4 + b * fxorn2 ** 3 + c * fxorn2 ** 2 + d * fxorn2 + f
                        xorn3 = a * fxorn3 ** 4 + b * fxorn3 ** 3 + c * fxorn3 ** 2 + d * fxorn3 + f
                        xorn = min([xorn1, xorn2, xorn3])
                    print(f"值域: (-∞,{better(xorn)}]")
                dda = 12 * a
                ddb = 6 * b
                ddc = 2 * c
                ddx0 = f2(dda, ddb, ddc, 1, 0)
                ddt = pow(ddb, 2) - 4 * dda * ddc
                ddx0.sort()
                if a < 0:
                    if len(D) == 1:
                        print(f"增区间: (-∞,{better(D[0])})")
                        print(f"减区间: ({better(D[0])},+∞)")
                    else:
                        print(f"增区间: ({better(D[1])},{better(D[2])}) , (-∞,{better(D[0])})")
                        print(f"减区间: ({better(D[0])},{better(D[1])}) , ({better(D[2])},+∞)")
                    if ddt > 0:
                        print(f"凹区间: ({better(ddx0[0])},{better(ddx0[1])})")
                        print(f"凸区间: (-∞,{better(ddx0[0])}) , ({better(ddx0[1])},+∞)")
                    else:
                        print("凹区间: 无")
                        print("凸区间: R")
                else:
                    if len(D) == 1:
                        print(f"增区间: ({better(D[0])},+∞)")
                        print(f"减区间: (-∞,{better(D[0])})")
                    else:
                        print(f"增区间: ({better(D[0])},{better(D[1])}) , ({better(D[2])},+∞)")
                        print(f"减区间: ({better(D[1])},{better(D[2])}) , (-∞,{better(D[0])})")
                    if ddt > 0:
                        print(f"凹区间: (-∞,{better(ddx0[0])}) , ({better(ddx0[1])},+∞)")
                        print(f"凸区间: ({better(ddx0[0])},{better(ddx0[1])})")
                    else:
                        print("凹区间: R")
                        print("凸区间: 无")
                if len(D) == 1:
                    jd = D[0]
                    fjd = a * pow(jd, 4) + b * pow(jd, 3) + c * pow(jd, 2) + d * jd + f
                    if a > 0:
                        print("极大值点: 无")
                        print(f"极小值点: ({better(jd)},{better(fjd)})")
                    else:
                        print(f"极大值点: ({better(jd)},{better(fjd)})")
                        print("极小值点: 无")
                else:
                    jd1 = D[0]
                    jd2 = D[1]
                    jd3 = D[2]
                    fjd1 = a * pow(jd1, 4) + b * pow(jd1, 3) + c * pow(jd1, 2) + d * jd1 + f
                    fjd2 = a * pow(jd2, 4) + b * pow(jd2, 3) + c * pow(jd2, 2) + d * jd2 + f
                    fjd3 = a * pow(jd3, 4) + b * pow(jd3, 3) + c * pow(jd3, 2) + d * jd3 + f
                    if a > 0:
                        print(f"极大值点: ({better(jd2)},{better(fjd2)})")
                        print(f"极小值点: ({better(jd1)},{better(fjd1)}) , ({better(jd3)},{better(fjd3)})")
                    else:
                        print(f"极大值点: ({better(jd1)},{better(fjd1)}) , ({better(jd3)},{better(fjd3)})")
                        print(f"极小值点: ({better(jd2)},{better(fjd2)})")
                if ddt > 0:
                    ddx1 = ddx0[0]
                    ddx2 = ddx0[1]
                    fddx1 = a * pow(ddx1, 4) + b * pow(ddx1, 3) + c * pow(ddx1, 2) + d * ddx1 + f
                    fddx2 = a * pow(ddx2, 4) + b * pow(ddx2, 3) + c * pow(ddx2, 2) + d * ddx2 + f
                    print(f"拐点: ({better(ddx1)},{better(fddx1)}) , ({better(ddx2)},{better(fddx2)})")
                else:
                    print("拐点: 无")
                print("f(0)=", better(f))
                print("方程y=f(x)=0的根:", end="")
                D = 3 * pow(b, 2) - 8 * a * c
                E = -pow(b, 3) + 4 * a * b * c - 8 * pow(a, 2) * d
                F = 3 * b ** 4 + 16 * pow(a, 2) * pow(c, 2) - 16 * a * c * b * b + 16 * a * a * b * d - 64 * pow(a,
                                                                                                                 3) * f
                A = D ** 2 - 3 * F
                B = D * F - 9 * E ** 2
                C = F ** 2 - 3 * D * E ** 2
                DT = B ** 2 - 4 * A * C
                if abs(D) + abs(E) + abs(F) == 0:
                    x = -b / (4 * a)
                    print(f"x={better(x)}")
                elif D * E * F != 0 and abs(A) + abs(B) + abs(C) == 0:
                    x1 = (-b * D + 9 * E) / (4 * a * D)
                    x2 = (-b * D - 3 * E) / (4 * a * D)
                    print(f"x={better(x1)} ∨ x={better(x2)}")
                elif abs(E) + abs(F) == 0 and D != 0:
                    if D > 0:
                        x1 = (-b + pow(D, 0.5)) / (4 * a)
                        x2 = (-b - pow(D, 0.5)) / (4 * a)
                        print(f"x={better(x1)} ∨ x={better(x2)}")
                    else:
                        r = -b / (4 * a)
                        cx = pow(-D, 0.5) / (4 * a)
                        if DTfop == 3:
                            if DTop == 3:
                                x1 = pl_out(r, cx, 0)
                                x2 = pl_out(r, -cx, 0)
                                print("x=" + x1 + " ∨ x=" + x2)
                            else:
                                tf1 = transform(r, cx, 0)
                                tf2 = transform(r, -cx, 0)
                                x1 = pl_out(tf1[0], tf1[1], 1)
                                x2 = pl_out(tf2[0], tf2[1], 1)
                                print("x=" + x1 + " ∨ x=" + x2)
                        else:
                            print("方程无实数根")
                elif A * B * C != 0 and DT == 0:
                    if A * B > 0:
                        x1 = (-b - 2 * A * E / B) / (4 * a)
                        x2 = (-b + 2 * A * E / B + pow(2 * B / A, 0.5)) / (4 * a)
                        x3 = (-b + 2 * A * E / B - pow(2 * B / A, 0.5)) / (4 * a)
                        print(f"x={better(x1)} ∨ x={better(x2)} ∨ x={better(x3)}")
                    else:
                        x1 = (-b - 2 * A * E / B) / (4 * a)
                        print(f"x={better(x1)}", end=" ")
                        r = (-b + 2 * A * E / B) / (4 * a)
                        cx = pow(-2 * B / A, 0.5) / (4 * a)
                        if DTfop == 3:
                            if DTop == 3:
                                x2 = pl_out(r, cx, 0)
                                x3 = pl_out(r, -cx, 0)
                                print("∨ x=" + x2 + " ∨ x=" + x3)
                            else:
                                tf1 = transform(r, cx, 0)
                                tf2 = transform(r, -cx, 0)
                                x2 = pl_out(tf1[0], tf1[1], 1)
                                x3 = pl_out(tf2[0], tf2[1], 1)
                                print("∨ x=" + x2 + " ∨ x=" + x3)
                        else:
                            print("其余根为复数")
                elif DT > 0:
                    z1 = A * D + 1.5 * (-B + pow(DT, 0.5))
                    z2 = A * D + 1.5 * (-B - pow(DT, 0.5))
                    z = D ** 2 - D * (fi(z1, 1 / 3) + fi(z2, 1 / 3)) + (fi(z1, 1 / 3) + fi(z2, 1 / 3)) ** 2 - 3 * A
                    x1 = (-b + sgn(E) * pow((D + fi(z1, 1 / 3) + fi(z2, 1 / 3)) / 3, 0.5) + (
                            (2 * D - fi(z1, 1 / 3) - fi(z2, 1 / 3) + 2 * z ** 0.5) / 3) ** 0.5) / (4 * a)
                    x2 = (-b + sgn(E) * pow((D + fi(z1, 1 / 3) + fi(z2, 1 / 3)) / 3, 0.5) - (
                            (2 * D - fi(z1, 1 / 3) - fi(z2, 1 / 3) + 2 * z ** 0.5) / 3) ** 0.5) / (4 * a)
                    print(f"x={better(x1)} ∨ x={better(x2)}", end=" ")
                    r = (-b - sgn(E) * pow((D + fi(z1, 1 / 3) + fi(z2, 1 / 3)) / 3, 0.5)) / (4 * a)
                    cx = ((-2 * D + fi(z1, 1 / 3) + fi(z2, 1 / 3) + 2 * z ** 0.5) / 3) ** 0.5 / (4 * a)
                    if DTfop == 3:
                        if DTop == 3:
                            x1 = pl_out(r, cx, 0)
                            x2 = pl_out(r, -cx, 0)
                            print("∨ x=" + x1 + " ∨ x=" + x2)
                        else:
                            tf1 = transform(r, cx, 0)
                            tf2 = transform(r, -cx, 0)
                            x1 = pl_out(tf1[0], tf1[1], 1)
                            x2 = pl_out(tf2[0], tf2[1], 1)
                            print("∨ x=" + x1 + " ∨ x=" + x2)
                    else:
                        print("其余根为复数")
                elif DT < 0:
                    ct = arccos((3 * B - 2 * A * D) / (2 * A ** 1.5))
                    y1 = (D - 2 * A ** 0.5 * cos(ct / 3)) / 3
                    y2 = (D + A ** 0.5 * (cos(ct / 3) + pow(3, 0.5) * sin(ct / 3))) / 3
                    y3 = (D + A ** 0.5 * (cos(ct / 3) - pow(3, 0.5) * sin(ct / 3))) / 3
                    if E == 0 and D > 0 and F > 0:
                        x1 = (-b + pow(D + 2 * F ** 0.5, 0.5)) / (4 * a)
                        x2 = (-b - pow(D + 2 * F ** 0.5, 0.5)) / (4 * a)
                        x3 = (-b + pow(D - 2 * F ** 0.5, 0.5)) / (4 * a)
                        x4 = (-b - pow(D - 2 * F ** 0.5, 0.5)) / (4 * a)
                        print(f"x={better(x1)} ∨ x={better(x2)} ∨ x={better(x3)} ∨ x={better(x4)}")
                    elif E == 0 and D < 0 < F:
                        r = -b / (4 * a)
                        cx1 = pow(-D + 2 * F ** 0.5, 0.5) / (4 * a)
                        cx2 = pow(-D - 2 * F ** 0.5, 0.5) / (4 * a)
                        if DTfop == 3:
                            if DTop == 3:
                                x1 = pl_out(r, cx1, 0)
                                x2 = pl_out(r, -cx1, 0)
                                print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                            else:
                                tf1 = transform(r, cx1, 0)
                                tf2 = transform(r, -cx1, 0)
                                x1 = pl_out(tf1[0], tf1[1], 1)
                                x2 = pl_out(tf2[0], tf2[1], 1)
                                print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                            if DTop == 3:
                                x3 = pl_out(r, cx2, 0)
                                x4 = pl_out(r, -cx2, 0)
                                print("x=" + x3 + " ∨ x=" + x4)
                            else:
                                tf3 = transform(r, cx2, 0)
                                tf4 = transform(r, -cx2, 0)
                                x3 = pl_out(tf3[0], tf3[1], 1)
                                x4 = pl_out(tf4[0], tf4[1], 1)
                                print("x=" + x3 + " ∨ x=" + x4)
                        else:
                            print("方程无实根")
                    elif E == 0 and F < 0:
                        r1 = (-2 * b + pow(2 * D + 2 * pow(A - F, 0.5), 0.5)) / (8 * a)
                        r2 = (-2 * b - pow(2 * D + 2 * pow(A - F, 0.5), 0.5)) / (8 * a)
                        cx = pow(-2 * D + 2 * pow(A - F, 0.5), 0.5) / (8 * a)
                        if DTfop == 3:
                            if DTop == 3:
                                x1 = pl_out(r1, cx, 0)
                                x2 = pl_out(r1, -cx, 0)
                                print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                            else:
                                tf1 = transform(r1, cx, 0)
                                tf2 = transform(r1, -cx, 0)
                                x1 = pl_out(tf1[0], tf1[1], 1)
                                x2 = pl_out(tf2[0], tf2[1], 1)
                                print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                            if DTop == 3:
                                x3 = pl_out(r2, cx, 0)
                                x4 = pl_out(r2, -cx, 0)
                                print("x=" + x3 + " ∨ x=" + x4)
                            else:
                                tf3 = transform(r2, cx, 0)
                                tf4 = transform(r2, -cx, 0)
                                x3 = pl_out(tf3[0], tf3[1], 1)
                                x4 = pl_out(tf4[0], tf4[1], 1)
                                print("x=" + x3 + " ∨ x=" + x4)
                        else:
                            print("方程无实根")
                    elif E != 0:
                        if D > 0 and F > 0:
                            x1 = (-b + sgn(E) * pow(y1, 0.5) + (y2 ** 0.5 + y3 ** 0.5)) / (4 * a)
                            x2 = (-b + sgn(E) * pow(y1, 0.5) - (y2 ** 0.5 + y3 ** 0.5)) / (4 * a)
                            x3 = (-b - sgn(E) * pow(y1, 0.5) + (y2 ** 0.5 - y3 ** 0.5)) / (4 * a)
                            x4 = (-b - sgn(E) * pow(y1, 0.5) - (y2 ** 0.5 - y3 ** 0.5)) / (4 * a)
                            print(f"x={better(x1)} ∨ x={better(x2)} ∨ x={better(x3)} ∨ x={better(x4)}")
                        else:
                            r1 = (-b - y2 ** 0.5) / (4 * a)
                            r2 = (-b + y2 ** 0.5) / (4 * a)
                            cx1 = (sgn(E) * pow(-y1, 0.5) + pow(-y3, 0.5)) / (4 * a)
                            cx2 = (sgn(E) * pow(-y1, 0.5) - pow(-y3, 0.5)) / (4 * a)
                            if DTfop == 3:
                                if DTop == 3:
                                    x1 = pl_out(r1, cx1, 0)
                                    x2 = pl_out(r1, -cx1, 0)
                                    print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                                else:
                                    tf1 = transform(r1, cx1, 0)
                                    tf2 = transform(r1, -cx1, 0)
                                    x1 = pl_out(tf1[0], tf1[1], 1)
                                    x2 = pl_out(tf2[0], tf2[1], 1)
                                    print("x=" + x1 + " ∨ x=" + x2, end=" ∨ ")
                                if DTop == 3:
                                    x3 = pl_out(r2, cx2, 0)
                                    x4 = pl_out(r2, -cx2, 0)
                                    print("x=" + x3 + " ∨ x=" + x4)
                                else:
                                    tf3 = transform(r2, cx2, 0)
                                    tf4 = transform(r2, -cx2, 0)
                                    x3 = pl_out(tf3[0], tf3[1], 1)
                                    x4 = pl_out(tf4[0], tf4[1], 1)
                                    print("x=" + x3 + " ∨ x=" + x4)
                            else:
                                print("方程无实根")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "f4"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v1":
        dtv1 = 0
        try:
            print("——————两个向量的加＆减运算——————")
            print("  子模式'v11':两个向量的加法运算")
            print("  子模式'v12':两个向量的减法运算")
            if aiv1 == "0":
                sonmode = input("  请选择子模式:")
            else:
                sonmode = input(f"  请选择子模式(回车进入子模式'{aiv1}'):")
            if sonmode == "":
                if aiv1 != "0":
                    sonmode = aiv1
                else:
                    dtv1 = 1
            if sonmode not in ["v11", "v12"]:
                if dtv1 == 0:
                    print(f"  不支持子模式:'{sonmode}'")
                else:
                    print(f"  暂不支持子模式:'{sonmode}'")
            else:
                if sonmode == "v11":
                    print("——————已选择加法运算:(a,b,c)+(d,f,g)——————")
                    n = "+"
                else:
                    print("——————已选择减法运算:(a,b,c)-(d,f,g)——————")
                    n = "-"
                aiv1 = sonmode
                print("———————————a,b,c,d,f,g∈R———————————")
                a = float(inputx(input("a="))[0])
                b = float(inputx(input("b="))[0])
                c = float(inputx(input("c="))[0])
                d = float(inputx(input("d="))[0])
                f = float(inputx(input("f="))[0])
                g = float(inputx(input("g="))[0])
                if sonmode == "v11":
                    oa = a + d
                    ob = b + f
                    oc = c + g
                else:
                    oa = a - d
                    ob = b - f
                    oc = c - g
                print(
                    f"({better(a)},{better(b)},{better(c)}){n}({better(d)},{better(f)},{better(g)})= ({better(oa)},{better(ob)},{better(oc)})")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v1"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v2":
        try:
            print("———————向量VctA=(a,b,c)与λ的数积———————")
            print("——————————————a,b,c,λ∈R——————————————")
            ax = float(inputx(input("a="))[0])
            ay = float(inputx(input("b="))[0])
            az = float(inputx(input("c="))[0])
            n = float(inputx(input("λ="))[0])
            print(
                f"{better(n)}*({better(ax)},{better(ay)},{better(az)})= ({better(ax * n)},{better(ay * n)},{better(az * n)})")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v2"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v3":
        try:
            print("———————向量VctA=(a,b,c)与VctB=(d,f,g)的内积———————")
            print("——————————————a,b,c,d,f,g∈R——————————————")
            ax = float(inputx(input("a="))[0])
            ay = float(inputx(input("b="))[0])
            az = float(inputx(input("c="))[0])
            bx = float(inputx(input("d="))[0])
            by = float(inputx(input("f="))[0])
            bz = float(inputx(input("g="))[0])
            print(
                f"({better(ax)},{better(ay)},{better(az)})·({better(bx)},{better(by)},{better(bz)})= {better(ax * bx + ay * by + az * bz)}")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v3"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v4":
        try:
            print("———————向量VctA=(a,b,c)与VctB=(d,f,g)的外积———————")
            print("——————————————a,b,c,d,f,g∈R——————————————")
            ax = float(inputx(input("a="))[0])
            ay = float(inputx(input("b="))[0])
            az = float(inputx(input("c="))[0])
            bx = float(inputx(input("d="))[0])
            by = float(inputx(input("f="))[0])
            bz = float(inputx(input("g="))[0])
            print(
                f"({better(ax)},{better(ay)},{better(az)})×({better(bx)},{better(by)},{better(bz)})= ({better(ay * bz - az * by)},{better(az * bx - ax * bz)},{better(ax * by - ay * bx)})")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v4"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v5":
        try:
            print("—————————向量VctA=(a,b,c)的模长计算—————————")
            print("———————————————a,b,c∈R———————————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            c = float(inputx(input("c="))[0])
            print(f"abs(({better(a)},{better(b)},{better(c)}))= {better(pow(a ** 2 + b ** 2 + c ** 2, 0.5))}")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v5"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v6":
        try:
            print("—————————向量VctA=(a,b,c)方向的单位向量—————————")
            print("————————————————a,b,c∈R————————————————")
            a = float(inputx(input("a="))[0])
            b = float(inputx(input("b="))[0])
            c = float(inputx(input("c="))[0])
            vabs = pow(a ** 2 + b ** 2 + c ** 2, 0.5)
            print(
                f"在({better(a)},{better(b)},{better(c)})方向上的单位向量为: ({better(a / vabs)},{better(b / vabs)},{better(c / vabs)})")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v6"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v7":
        try:
            print("———————向量VctA=(a,b,c)与VctB=(d,f,g)形成的角———————")
            print("——————————————a,b,c,d,f,g∈R——————————————")
            ax = float(inputx(input("a="))[0])
            ay = float(inputx(input("b="))[0])
            az = float(inputx(input("c="))[0])
            bx = float(inputx(input("d="))[0])
            by = float(inputx(input("f="))[0])
            bz = float(inputx(input("g="))[0])
            cosct = (ax * bx + ay * by + az * bz) / (
                pow((ax ** 2 + ay ** 2 + az ** 2) * (bx ** 2 + by ** 2 + bz ** 2), 0.5))
            print(
                f"<({better(ax)},{better(ay)},{better(az)}),({better(bx)},{better(by)},{better(bz)})>= {better(arccos(cosct))}")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v7"
        lock = 0
        print("—————————————————————————————————")
    elif mode == "v8":
        try:
            print("———————向量VctA=(a,b,c)在向量VctB=(d,f,g)上的投影及投影向量———————")
            print("—————————————————a,b,c,d,f,g∈R—————————————————")
            ax = float(inputx(input("a="))[0])
            ay = float(inputx(input("b="))[0])
            az = float(inputx(input("c="))[0])
            bx = float(inputx(input("d="))[0])
            by = float(inputx(input("f="))[0])
            bz = float(inputx(input("g="))[0])
            absa = pow(ax ** 2 + ay ** 2 + az ** 2, 0.5)
            absb = pow(bx ** 2 + by ** 2 + bz ** 2, 0.5)
            cosct = (ax * bx + ay * by + az * bz) / (absa * absb)
            le = absa * cosct
            oa = (bx / absb) * le
            ob = (by / absb) * le
            oc = (bz / absb) * le
            print(
                f"({better(ax)},{better(ay)},{better(az)})在({better(bx)},{better(by)},{better(bz)})方向上的投影,投影向量分别为:{better(absa * cosct)} , ({better(oa)},{better(ob)},{better(oc)})")
        except:
            if bbmdt == 0:
                print("语法错误")
        ai = "v8"
        lock = 0
        print("—————————————————————————————————")
    else:
        print("不支持模式:'" + mode + "'")
        print("—————————————————————————————————")
