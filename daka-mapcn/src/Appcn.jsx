import { placesRef, getDocs, addDoc } from "./firebase";
import { collection, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import robotIcon from "./assets/robot-ai.png";

// ----------- AI 聊天逻辑可和国际版复用 ----------------
async function getAIReply(message, chatMessages = []) {
  const apiKey = "sk-688fc2762d7c4b14b0a97bae8b646075";
  const url = "https://api.deepseek.com/v1/chat/completions";
  const systemPrompt = `
你是 Daka AI，一个知识渊博、风趣幽默的全能型聊天助手。你可以回答各种问题、闲聊、讲笑话、写代码、翻译，也能提供广州本地的生活建议。
如果用户提到地点、美食、出行或旅游，你会优先结合本地信息提供建议。你说话简洁自然，像朋友一样聊天。
`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...(chatMessages || []).map(m => ({
            role: m.user === "DAKA AI" ? "assistant" : "user",
            content: m.text
          })),
          { role: "user", content: message }
        ],
        temperature: 0.7,
      })
    });

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content || "AI 暂时没有回复，请稍后再试。";
    // 检查回复中是否包含地址、地点、位置关键词，并自动插入 [map:地址]
    const addressPattern = /(?:地址|地点|位置)[：:]?\s*([\u4e00-\u9fa5a-zA-Z0-9\s\-，,]+?)(?:。|！|!|\n|$)/;
    const match = reply.match(addressPattern);
    if (match) {
      reply += ` [map:${match[1].trim()}]`;
    }
    return reply;
  } catch (err) {
    return "AI 连接失败，请稍后再试。";
  }
}

// ----------- 地点/评论数据结构可复用你的实现 --------------
const mockPlaces = [
  {
    id: 1,
    name: "广州老城区涂鸦墙",
    description: "一个隐藏在西关巷子里的文艺涂鸦墙，非常适合拍照。",
    lat: 23.1291,
    lng: 113.2644,
    imageUrl: "https://via.placeholder.com/300x200?text=Guangzhou+Wall"
  }
];

function Appcn() {
  // 移动端判断
  const isMobile = window.innerWidth < 768;
  // 更小屏手机判断
  const isSmallMobile = window.innerWidth < 375;
  // 地图选择按钮统一样式
  const btnStyle = {
    width: 420,
    height: 90,
    display: "flex",
    alignItems: "center",
    justifyContent: "left",
    gap: 18,
    fontSize: "2.2rem",
    background: "#000",
    color: "#fff",
    border: "3px solid #fff",
    borderRadius: 20,
    margin: "32px auto",
    paddingLeft: 30,
    cursor: "pointer",
  };
  // -------------------- 页面主状态 ----------------------
  // 管理员测试账户
  const adminAccount = { email: "sing", password: "sing" };
  const [entered, setEntered] = useState(false);
  // Firebase 匿名用户
  const [user, setUser] = useState(null);
  // 登录表单状态
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 控制是否显示注册表单
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  // 监听 Firebase 用户状态
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [places, setPlaces] = useState([]);

  // 新marker弹窗
  const [addModal, setAddModal] = useState({ visible: false, lat: null, lng: null });
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceDesc, setNewPlaceDesc] = useState("");
  const [newPlaceImage, setNewPlaceImage] = useState(null);

  // 评论
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState({});

  // AI 聊天相关
  // const [chatOpen, setChatOpen] = useState(false); // 弹窗相关已废弃
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      user: "DAKA AI",
      text: "Hi，我是 Daka AI，你的本地生活向导和AI朋友！🌟 无论你想打卡哪里、找美食、查攻略，还是纯聊天，都可以找我！快来问我任何关于广州、地图、生活玩乐的问题吧！"
    }
  ]);
  // 用户聊天室消息
  const [userChatMessages, setUserChatMessages] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);
  // 聊天室展开/收起
  const [chatExpanded, setChatExpanded] = useState(false);
  // 聊天模式: "AI" or "User"
  const [chatMode, setChatMode] = useState("AI"); // "AI" or "User"
  // 聊天滚动到底部锚点
  const chatEndRef = useRef(null);
  // 聊天消息变化时滚动到底部
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, aiThinking, userChatMessages]);

  // 监听 Firebase 用户聊天室消息
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "user-messages"), orderBy("createdAt"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data());
      // 按用户分组
      const grouped = {};
      messages.forEach(msg => {
        if (!grouped[msg.user]) grouped[msg.user] = [];
        grouped[msg.user].push(msg);
      });
      setUserChatMessages(grouped);
    });
    return () => unsubscribe();
  }, [user]);
  // 聊天输入框移动端键盘遮挡适配
  useEffect(() => {
    const handleFocus = () => {
      if (isMobile) {
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 300);
      }
    };
    const input = document.querySelector("input");
    if (input) input.addEventListener("focus", handleFocus);
    return () => {
      if (input) input.removeEventListener("focus", handleFocus);
    };
  }, []);
  // 地图展开/收起
  const [mapExpanded, setMapExpanded] = useState(false);

  // 高德地图
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  // 拖动相关
  const dragMapRef = useRef(null);
  const dragChatRef = useRef(null);
  // ----------- 拖动逻辑 -----------
  // 聊天室拖动
  useEffect(() => {
    const el = dragChatRef.current;
    if (!el) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    // 鼠标拖动
    const handleMouseDown = (e) => {
      isDragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
    };

    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    // 触屏拖动
    const handleTouchStart = (e) => {
      isDragging = true;
      const touch = e.touches[0];
      offsetX = touch.clientX - el.offsetLeft;
      offsetY = touch.clientY - el.offsetTop;
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      el.style.left = `${touch.clientX - offsetX}px`;
      el.style.top = `${touch.clientY - offsetY}px`;
    };

    const handleTouchEnd = () => {
      isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };

    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("touchstart", handleTouchStart);

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("touchstart", handleTouchStart);
    };
  }, []);

  // 地图拖动
  useEffect(() => {
    const el = dragMapRef.current;
    if (!el) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    // 鼠标拖动
    const handleMouseDown = (e) => {
      isDragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
    };

    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    // 触屏拖动
    const handleTouchStart = (e) => {
      isDragging = true;
      const touch = e.touches[0];
      offsetX = touch.clientX - el.offsetLeft;
      offsetY = touch.clientY - el.offsetTop;
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      el.style.left = `${touch.clientX - offsetX}px`;
      el.style.top = `${touch.clientY - offsetY}px`;
    };

    const handleTouchEnd = () => {
      isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };

    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("touchstart", handleTouchStart);

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("touchstart", handleTouchStart);
    };
  }, []);

  // -------- Firebase 拉取数据 ---------
  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        const snapshot = await getDocs(placesRef);
        const firebasePlaces = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPlaces(firebasePlaces);
      } catch (err) {
        console.error("获取 Firebase 地点失败：", err);
      }
    };
    fetchPlaces();
  }, []);

  // ------ 高德地图加载 ------
  useEffect(() => {
    if (!entered) return;
    if (window.AMap && !mapRef.current) {
      initMap();
      return;
    }
    if (!window.AMap) {
      // 插件参数加入AMap.Geocoder,AMap.Geolocation,AMap.Walking
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/maps?v=2.0&key=e401309b65cddb62e36775c65c4ebdac&plugin=AMap.Geocoder,AMap.Geolocation,AMap.Walking";
      script.async = true;
      script.onload = () => {
        if (window.AMap) initMap();
      };
      document.body.appendChild(script);
    }
    function initMap() {
      console.log("初始化地图");

      const container = document.getElementById("mapContainer");

      if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
        console.log("容器尺寸尚未就绪，延迟加载地图");
        setTimeout(initMap, 300);
        return;
      }

      mapRef.current = new window.AMap.Map("mapContainer", {
        center: [113.2644, 23.1291],
        zoom: 13,
      });

      // 获取用户当前位置
      window.AMap.plugin('AMap.Geolocation', function () {
        const geolocation = new window.AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        mapRef.current.addControl(geolocation);
        geolocation.getCurrentPosition(function (status, result) {
          if (status === 'complete' && result.position) {
            const lng = result.position.lng;
            const lat = result.position.lat;
            window.currentPosition = [lng, lat]; // 存储为全局变量
          } else {
            console.warn("定位失败", result);
          }
        });
      });

      mapRef.current.on('click', function (e) {
        setAddModal({ visible: true, lat: e.lnglat.lat, lng: e.lnglat.lng });
      });
    }
    return () => { mapRef.current = null; };
  }, [entered]);

  // ------ 渲染marker ------
  // 步行导航路线绘制
  const drawRoute = (start, end) => {
    if (!window.AMap || !mapRef.current) return;
    window.AMap.plugin('AMap.Walking', function () {
      const walking = new window.AMap.Walking({
        map: mapRef.current
      });
      walking.search(start, end, function (status, result) {
        if (status !== 'complete') {
          console.warn("步行路径规划失败", result);
        }
      });
    });
  };

  useEffect(() => {
    if (!entered || !mapRef.current) return;
    if (markersRef.current) markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    places.forEach((place) => {
      const marker = new window.AMap.Marker({
        position: [place.lng, place.lat],
        title: place.name,
        map: mapRef.current
      });
      marker.on("click", () => {
        setSelectedPlace(place);
        if (window.currentPosition) {
          drawRoute(window.currentPosition, [place.lng, place.lat]);
        }
      });
      markersRef.current.push(marker);
    });
  }, [places, entered]);

  // ----------- AI地图跳转 -----------
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last.user === "DAKA AI") {
      const match = last.text.match(/\[map:(.+?)\]/);
      if (match) {
        jumpToAddress(match[1]);
      }
    }
  }, [chatMessages]);

  // ----------- 高德地图定位 -----------
  const jumpToAddress = (address) => {
    if (!window.AMap || !mapRef.current) return;
    const geocoder = new window.AMap.Geocoder();
    geocoder.getLocation(address, (status, result) => {
      if (status === 'complete' && result.geocodes.length) {
        const loc = result.geocodes[0].location;
        mapRef.current.setCenter([loc.lng, loc.lat]);
        mapRef.current.setZoom(17);
        const marker = new window.AMap.Marker({
          position: [loc.lng, loc.lat],
          title: address,
          map: mapRef.current
        });
        markersRef.current.push(marker);
      } else {
        alert("高德地图找不到该地址！");
      }
    });
  };

  // ----------- 聊天发送消息 -----------
  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMessage = chatInput.trim();
    setChatMessages(msgs => [...msgs, { user: "我", text: userMessage }]);
    setAiThinking(true);
    setChatInput(""); // 这里保留立即清空行为
    setTimeout(() => {
      const input = document.querySelector("input");
      if (input) {
        input.value = "";
        input.blur();
      }
    }, 10);
    setTimeout(async () => {
      const aiReply = await getAIReply(userMessage, chatMessages);
      setChatMessages(msgs => [...msgs, { user: "DAKA AI", text: aiReply }]);
      setAiThinking(false);
    }, 500);
  };

  const sendUserMessage = async () => {
    if (!chatInput.trim()) return;
    await addDoc(collection(db, "user-messages"), {
      user: user.email,
      text: chatInput.trim(),
      createdAt: serverTimestamp()
    });
    setChatInput(""); // 保留清空行为
    setTimeout(() => {
      const input = document.querySelector("input");
      if (input) {
        input.value = "";
        input.blur();
      }
    }, 10);
  };

  // ----------- 文件转Base64 -----------
  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  // ---------- 页面结构 ----------
  if (!entered) {
    return (
      <div style={{
        background: "#000", color: "#fff", width: "100vw", height: "100vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        position: "relative"
      }}>
        {/* 左上角返回按钮 */}
        <button
          onClick={() => window.location.href = '/'}
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            background: "#222",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "8px 18px",
            fontSize: 16,
            cursor: "pointer",
            zIndex: 99,
          }}
        >返回主页</button>
        <img
          src="/LOGO.png"
          alt="Logo"
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            objectFit: "contain",
            marginBottom: "1.5rem",
            border: "2px solid #fff",
            backgroundColor: "#000"
          }}
        />
        <h1 style={{ fontSize: 44, marginBottom: 20 }}>Daka 中国区</h1>
        <p style={{ color: "#ccc", marginBottom: 10 }}>
          {showRegisterForm ? "请输入邮箱和密码后点击确认注册" : "请先输入邮箱和密码再点击注册"}
        </p>
        {!showRegisterForm && (
          <>
            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: 240,
                padding: 10,
                marginBottom: 10,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: 240,
                padding: 10,
                marginBottom: 20,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />
          </>
        )}
        {/* 注册表单条件渲染 */}
        {showRegisterForm && (
          <>
            <input
              type="email"
              placeholder="注册邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: 240,
                padding: 10,
                marginBottom: 10,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />
            <input
              type="password"
              placeholder="注册密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: 240,
                padding: 10,
                marginBottom: 20,
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />
            <button
              onClick={async () => {
                const auth = getAuth();
                if (!email || !password) {
                  alert("请输入邮箱和密码后再注册！");
                  return;
                }
                try {
                  await createUserWithEmailAndPassword(auth, email, password);
                  alert("注册成功，请返回登录页面登录！");
                  setShowRegisterForm(false);
                } catch (err) {
                  if (err.code === "auth/email-already-in-use") {
                    alert("该邮箱已注册，请返回登录页面登录！");
                    setShowRegisterForm(false);
                  } else {
                    alert("注册失败：" + err.message);
                    console.error(err);
                  }
                }
              }}
              style={{
                width: 252,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                fontSize: "1.3rem",
                whiteSpace: "nowrap",
                background: "#7ed957",
                color: "#000",
                border: "3px solid #fff",
                borderRadius: 12,
                margin: "12px 0",
                cursor: "pointer"
              }}
            >
              ✅ 确认注册
            </button>
          </>
        )}
        {/* 登录和注册按钮 */}
        {!showRegisterForm && (
          <>
            <button
              onClick={async () => {
                // 管理员登录优先判断
                if (email === adminAccount.email && password === adminAccount.password) {
                  alert("管理员登录成功！");
                  setEntered(true);
                  return;
                }
                const auth = getAuth();
                try {
                  const result = await signInWithEmailAndPassword(auth, email, password);
                  setUser(result.user);
                  setEntered(true);
                } catch (err) {
                  alert("登录失败，请检查邮箱和密码是否正确！");
                  console.error(err);
                }
              }}
              style={{
                width: 252,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                fontSize: "1.3rem",
                whiteSpace: "nowrap",
                background: "#000",
                color: "#fff",
                border: "3px solid #fff",
                borderRadius: 12,
                margin: "20px 0",
                cursor: "pointer"
              }}
            >
              🚀 开始探索
            </button>
            <button
              onClick={() => setShowRegisterForm(true)}
              style={{
                width: 252,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                fontSize: "1.3rem",
                whiteSpace: "nowrap",
                background: "#444",
                color: "#fff",
                border: "3px solid #fff",
                borderRadius: 12,
                margin: "12px 0",
                cursor: "pointer"
              }}
            >
              📝 注册新账户
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        width: "100vw",
        overflow: "hidden",
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 顶部栏 */}
      <div
        style={{
          padding: "20px 32px 0 32px",
          display: "flex",
          alignItems: "center",
          width: "100vw",
        }}
      >
        <button
          onClick={() => setEntered(false)}
          style={{
            background: "#222",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          返回主页
        </button>
        <h1
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 32,
            margin: 0,
          }}
        >
          Daka 地图打卡
        </h1>
        <div style={{ width: 124 }} /> {/* 占位 */}
      </div>
      {/* 主内容区域：地图+AI 聊天室 */}
      <div
        style={{
          width: "100vw",
          height: "calc(100vh - 80px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: 0,
          background: "#000",
          position: "relative",
        }}
      >
        {/* 地图区域始终可见 */}
        <div
          ref={dragMapRef}
          style={{
            position: "absolute",
            top: isSmallMobile ? 2 : isMobile ? 16 : 40,
            left: isSmallMobile ? 2 : isMobile ? 8 : 20,
            width: isSmallMobile ? "94vw" : isMobile ? "92vw" : 640,
            height: isSmallMobile ? "35vh" : isMobile ? "45vh" : 500,
            zIndex: 10,
            background: "#222",
            borderRadius: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            border: "6px solid #fff",
            overflow: "hidden",
            cursor: "move",
            display: "flex",
            flexDirection: "column",
            minWidth: 300,
            minHeight: 300
          }}
        >
          <div
            id="mapContainer"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: "10px",
              boxShadow: "none",
              flex: 1,
            }}
          />
          {selectedPlace && (
            <div style={{ margin: 20, border: "1px solid #ccc", borderRadius: "10px", padding: 16, background: "#111", boxShadow: "0 2px 8px #0007", position: "absolute", top: 20, left: 20, right: 20, zIndex: 20 }}>
              <h2>{selectedPlace.name}</h2>
              <img src={selectedPlace.imageUrl} alt={selectedPlace.name} style={{ width: "100%", borderRadius: "8px" }} />
              <p style={{ marginTop: 10 }}>{selectedPlace.description}</p>
              <div style={{ marginTop: 20 }}>
                <h3>评论</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {(comments[selectedPlace.id] || []).map((c, i) => (
                    <li key={i} style={{ background: "#222", margin: "8px 0", padding: "6px 10px", borderRadius: "6px" }}>{c}</li>
                  ))}
                </ul>
                <input
                  type="text"
                  placeholder="留下你的评论..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{ width: "100%", padding: "8px", marginTop: 10, borderRadius: "4px", border: "1px solid #444", background: "#000", color: "#fff" }}
                />
                <button
                  onClick={() => {
                    if (!comment.trim()) return;
                    setComments(prev => ({
                      ...prev,
                      [selectedPlace.id]: [...(prev[selectedPlace.id] || []), comment]
                    }));
                    setComment("");
                  }}
                  style={{ marginTop: 10 }}
                >
                  提交评论
                </button>
                <button onClick={() => setSelectedPlace(null)} style={{ marginTop: 10, marginLeft: 10 }}>关闭</button>
              </div>
            </div>
          )}
        </div>
        {/* AI 聊天室区域 */}
        <div
          ref={dragChatRef}
          style={
            !chatExpanded
              ? {
                  position: "absolute",
                  bottom: 40,
                  right: 40,
                  width: 64,
                  height: 64,
                  zIndex: 9999,
                  borderRadius: 20,
                  overflow: "hidden"
                }
              : {
                  position: "absolute",
                  bottom: isSmallMobile ? 10 : 40,
                  right: isSmallMobile ? 10 : 40,
                  width: isSmallMobile ? "94vw" : isMobile ? "90vw" : 360,
                  maxHeight: isSmallMobile ? "60vh" : "80vh",
                  zIndex: 9999,
                  background: "#222",
                  borderRadius: 20,
                  border: "6px solid #fff",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  boxSizing: "border-box"
                }
          }
        >
          {!chatExpanded ? (
            <button
              onClick={() => setChatExpanded(true)}
              style={{
                width: 64,
                height: 64,
                background: "#fff",
                borderRadius: 20,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 8px rgba(0,0,0,0.4)",
                cursor: "pointer",
                padding: 0,
                margin: 0
              }}
            >
              <img src={robotIcon} alt="AI" style={{ width: 36, height: 36, display: "block" }} />
            </button>
          ) : (
            <div
              style={{
                width: "100%",
                background: "#222",
                borderRadius: 14,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                boxShadow: "none",
                border: "none"
              }}
            >
              <button
                onClick={() => setChatExpanded(false)}
                style={{
                  alignSelf: "flex-end",
                  marginBottom: 8,
                  background: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer"
                }}
              >
                收起
              </button>
              <div style={{ marginBottom: 8, fontWeight: "bold", fontSize: 18, color: "#fff" }}>
                Daka 聊天室（{chatMode === "AI" ? "AI 模式" : "用户模式"}）
                <button
                  onClick={() => setChatMode(prev => prev === "AI" ? "User" : "AI")}
                  style={{
                    marginLeft: 12,
                    fontSize: 14,
                    background: "#444",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "2px 8px",
                    cursor: "pointer"
                  }}
                >
                  切换为{chatMode === "AI" ? "用户聊天室" : "AI 聊天室"}
                </button>
              </div>
              <div style={{
                flex: 1,
                overflowY: "auto",
                background: "#111",
                borderRadius: 8,
                padding: 8,
                marginBottom: 8,
                color: "#eee",
                maxHeight: isSmallMobile
                  ? "calc(60vh - 120px)"
                  : isMobile
                  ? "calc(80vh - 120px)"
                  : "calc(80vh - 120px)",
                scrollBehavior: "smooth"
              }}>
                {chatMode === "AI" ? (
                  chatMessages.length === 0 ? (
                    <div style={{ color: "#666", textAlign: "center", marginTop: 32 }}>暂无消息</div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} style={{ margin: "8px 0" }}>
                        <span style={{ fontWeight: "bold", color: "#7ed957" }}>{msg.user}</span>
                        <span style={{ marginLeft: 10 }}>{msg.text}</span>
                      </div>
                    ))
                  )
                ) : (
                  Object.keys(userChatMessages).length === 0 ? (
                    <div style={{ color: "#666", textAlign: "center", marginTop: 32 }}>暂无用户消息</div>
                  ) : (
                    Object.keys(userChatMessages).map((email, i) => (
                      <div key={i} style={{ marginBottom: 20 }}>
                        <div style={{ fontWeight: "bold", color: "#7ed957", fontSize: 16, marginBottom: 6 }}>
                          👤 {email}
                        </div>
                        {userChatMessages[email].map((msg, j) => (
                          <div key={j} style={{ margin: "6px 0" }}>
                            <span>{msg.text}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )
                )}
                {aiThinking && chatMode === "AI" && (
                  <div style={{ color: "#7ed957", margin: "8px 0", fontWeight: "bold" }}>
                    DAKA AI 正在输入...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ width: "100%" }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter") {
                      if (chatMode === "AI") sendMessage();
                      else sendUserMessage();
                    }
                  }}
                  placeholder="输入消息并回车发送"
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #444", background: "#000", color: "#fff" }}
                />
                <button
                  onClick={async () => {
                    if (chatMode === "AI") sendMessage();
                    else sendUserMessage();
                  }}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    borderRadius: 6,
                    background: "#7ed957",
                    color: "#000",
                    border: "none",
                    padding: 10,
                    fontWeight: "bold"
                  }}
                >
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* 添加新地点弹窗 */}
      {addModal.visible && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#222", borderRadius: 10, padding: 28, minWidth: 320, color: "#fff"
          }}>
            <h2 style={{ marginBottom: 16 }}>添加新打卡点</h2>
            <input
              type="text"
              placeholder="地点名称"
              value={newPlaceName}
              onChange={e => setNewPlaceName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8, borderRadius: 4, border: "1px solid #444", background: "#111", color: "#fff" }}
            />
            <input
              type="text"
              placeholder="描述"
              value={newPlaceDesc}
              onChange={e => setNewPlaceDesc(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8, borderRadius: 4, border: "1px solid #444", background: "#111", color: "#fff" }}
            />
            <input
              type="file"
              accept="image/*"
              onChange={async e => {
                const file = e.target.files[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setNewPlaceImage(base64);
                }
              }}
              style={{ color: "#fff", marginBottom: 10 }}
            />
            {newPlaceImage && (
              <img src={newPlaceImage} alt="预览" style={{ width: "100%", maxWidth: 250, borderRadius: 8, marginBottom: 10 }} />
            )}
            <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
              <button onClick={() => {
                setAddModal({ visible: false, lat: null, lng: null });
                setNewPlaceName("");
                setNewPlaceDesc("");
                setNewPlaceImage(null);
              }}
                style={{ padding: "6px 16px", borderRadius: 6, background: "#444", color: "#fff", border: "none", cursor: "pointer" }}
              >取消</button>
              <button
                onClick={async () => {
                  if (!newPlaceName || !newPlaceImage) {
                    alert("请填写地点名称并上传图片！");
                    return;
                  }
                  if (addModal.lat === null || addModal.lng === null) {
                    alert("没有获取到地图坐标，请点击地图后再试！");
                    return;
                  }
                  try {
                    await addDoc(placesRef, {
                      name: newPlaceName,
                      description: newPlaceDesc,
                      lat: addModal.lat,
                      lng: addModal.lng,
                      imageUrl: newPlaceImage,
                    });
                    // 重新拉取
                    const snapshot = await getDocs(placesRef);
                    const firebasePlaces = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setPlaces(firebasePlaces);
                  } catch (err) {
                    alert("添加失败: " + err.message);
                  }
                  setAddModal({ visible: false, lat: null, lng: null });
                  setNewPlaceName("");
                  setNewPlaceDesc("");
                  setNewPlaceImage(null);
                }}
                style={{ padding: "6px 16px", borderRadius: 6, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Appcn;
