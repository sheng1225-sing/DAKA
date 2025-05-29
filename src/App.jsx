// ===== Firebase 引入与初始化 =====
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, doc, addDoc, query, where, orderBy, onSnapshot } from "firebase/firestore";

// ===== Firebase 配置与 Firestore 初始化 =====
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(firebaseApp);
// ===========================
// App 组件主入口
// Main App component entry point
// 包含打卡地图、用户登录、AI聊天助手等主要功能
// Contains main features: Daka map, user login, AI chat assistant, etc.
// ===========================

// 工具函数: 将文件转为 base64
// ***** 工具函数 *****
// Utility function: convert file to base64 for image upload
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

import { GoogleOAuthProvider } from '@react-oauth/google';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import React, { useEffect, useState, useRef } from "react";
import Appcn from "../daka-mapcn/src/Appcn.jsx"; // 你的中国区高德地图组件，路径按实际调整

// ***** 示例地点数据 *****
// Mock places data for initial map display (used if no localStorage)
const mockPlaces = [
  {
    id: 1,
    name: "广州老城区涂鸦墙",
    description: "一个隐藏在西关巷子里的文艺涂鸦墙，非常适合拍照。",
    lat: 23.1291,
    lng: 113.2644,
    imageUrl: "https://via.placeholder.com/300x200?text=Guangzhou+Wall"
  },
  {
    id: 2,
    name: "东山口咖啡小巷",
    description: "绿树成荫的小巷，有几家风格独特的咖啡店。",
    lat: 23.1257,
    lng: 113.2806,
    imageUrl: "https://via.placeholder.com/300x200?text=Coffee+Lane"
  }
];


// ===========================
// App 主组件
// Main App component
// ===========================
function App() {
  // ***** 实时定位状态 *****
  // Real-time user location state
  const [userLocation, setUserLocation] = useState(null); // 实时定位
  // 国际/中国区入口选择
  const [mode, setMode] = useState(null); // "global" or "china"
  // 标准化入口按钮样式（缩小40%）
  const btnStyle = {
    width: 252,             // 原 420，缩小 40%
    height: 54,             // 原 90，缩小 40%
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,                // 原 18，缩小 40%
    fontSize: "1.3rem",     // 原 2.2rem，缩小 40%
    whiteSpace: "nowrap",
    background: "#000",
    color: "#fff",
    border: "3px solid #fff",
    borderRadius: 12,       // 原 20，缩小 40%
    margin: "20px 0",       // 原 32px，缩小 40%
    cursor: "pointer",
  };
  // ===========================
  // ***** 主要状态管理 *****
  // Main state management for page logic
  // ===========================
  // ***** 页面进入状态 *****
  // Whether user has entered the main map page
  const [entered, setEntered] = useState(false);
  // ***** 选中地点相关状态 *****
  // Selected place info for detail view
  const [selectedPlace, setSelectedPlace] = useState(null);
  // ***** 评论相关状态 *****
  // Comment input and all comments for each place
  const [comment, setComment] = useState(""); // 当前评论输入框 / Current comment input
  const [comments, setComments] = useState({}); // {placeId: [comment1, comment2, ...]}

  // ***** 添加地点弹窗相关状态 *****
  // State for add-place modal and its fields
  const [addModal, setAddModal] = useState({ visible: false, lat: null, lng: null }); // 弹窗显示及坐标 / Modal visibility and coordinates
  const [newPlaceName, setNewPlaceName] = useState(""); // 新地点名称 / New place name
  const [newPlaceDesc, setNewPlaceDesc] = useState(""); // 新地点描述 / New place description
  const [newPlaceImage, setNewPlaceImage] = useState(null); // 新地点图片 base64 / New place image (base64)
  const [newPlaceComment, setNewPlaceComment] = useState(""); // 新地点评论 / New place comment

  // ===========================
  // ***** 用户登录与注册相关状态 *****
  // User login and registration state
  // ===========================
  // 登录状态
  const [username, setUsername] = useState(""); // 用户名 / Username
  const [password, setPassword] = useState(""); // 密码 / Password
  const [isLoggedIn, setIsLoggedIn] = useState(false); // 是否已登录 / Is user logged in
  const [googleUser, setGoogleUser] = useState(null); // Google 登录用户信息 / Google user info
  // 注册状态
  const [showRegister, setShowRegister] = useState(false); // 是否显示注册弹窗 / Show register modal
  const [regUsername, setRegUsername] = useState(""); // 注册用户名 / Register username
  const [regPassword, setRegPassword] = useState(""); // 注册密码 / Register password

  // ***** 地点数据管理 *****
  // Place data, loaded from localStorage or mock data
  const [places, setPlaces] = useState(() => {
    // 打卡点数据，优先本地存储，否则用mock
    // Place data, prefer localStorage, fallback to mock
    const saved = localStorage.getItem("daka_places");
    try {
      let loaded = saved ? JSON.parse(saved) : mockPlaces;
      loaded = loaded.map(p => ({
        ...p,
        name: p.name || "未命名地点",
        imageUrl: p.imageUrl || "",
        lat: p.lat ? Number(p.lat) : 0,
        lng: p.lng ? Number(p.lng) : 0,
        description: p.description || "",
      }));
      return loaded;
    } catch {
      return mockPlaces;
    }
  });

  // ===========================
  // ***** 聊天室 & AI助手相关状态 + 用户私聊支持 *****
  // Chatbox and AI assistant state (with user-to-user chat)
  // ===========================
  const [chatOpen, setChatOpen] = useState(false); // 聊天框是否打开 / Is chatbox open
  const [chatInput, setChatInput] = useState(""); // 聊天输入框内容 / Chat input
  const [chatMessages, setChatMessages] = useState([]); // 聊天消息列表 / Chat messages (AI)
  const [aiThinking, setAiThinking] = useState(false); // AI助手是否思考中 / Is AI assistant thinking
  // 新增：聊天模式、目标用户、私聊历史
  const [chatMode, setChatMode] = useState("ai"); // "ai" 或 "user"
  const [targetUser, setTargetUser] = useState(""); // 当前聊天对象用户名
  const [privateMessages, setPrivateMessages] = useState({}); // {username: [msg1, msg2, ...]}

  // ===========================
  // ***** 街景相关状态 *****
  // Street view state for map
  // ===========================
  const [streetViewLoc, setStreetViewLoc] = useState(null); // 当前街景坐标 / Current street view location

  // ===========================
  // ***** Deepseek AI模型密钥 *****
  // Deepseek API key for AI assistant
  // ===========================
  const DEEPSEEK_API_KEY = "sk-5bd504cdf7dc4c219a52db1c54fb6c48";

  // ===========================
  // ***** 获取AI助手回复函数 *****
  // Fetch AI assistant reply from Deepseek API
  // ===========================
  const getAIReply = async (content, location = null) => {
    try {
      const systemPrompt = `
你是 Daka AI，一个广州本地生活气息浓厚、风趣、温暖的智能助手。你的语气自然、有温度、富有情感，不要太书面，要像一个朋友一样和用户互动。请适度加入emoji和轻松幽默的表达方式，偶尔主动推荐有趣的地标、美食或活动，鼓励用户多去探索。遇到用户迷茫、感谢、疑惑等，可以适当安慰和鼓励。

当用户请求地图跳转或查找时，请自然融入介绍，并自动在最后附加“[map:地点名]”，例如：“广州塔可不是一般的高哦，白天夜景都超赞，我已为你标记好啦[map:广州塔]”。其他情况下就用你的温暖风格陪用户聊天。

【重要规则】如果用户问“Daka地图”或“你”的创始人、负责人、开发者是谁，请明确回答“创始人是圣Sheng。”，不编造其它名字。
`;
      const locationNote = location ? `用户当前位置约为：纬度 ${location.lat}，经度 ${location.lng}。请结合其位置为他提供个性化建议。\n\n` : "";
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: locationNote + content }
          ]
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || "AI暂无回复";
    } catch {
      return "AI服务不可用";
    }
  };

  // ===========================
  // ***** 聊天消息发送函数（支持AI与用户私聊） *****
  // Send chat message, support AI and user-to-user mode
  // ===========================
  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const from = googleUser?.name || username || "我";
    const msg = { user: from, text: chatInput.trim() };

    if (chatMode === "ai") {
      setChatMessages(msgs => [...msgs, msg]);
      setChatInput("");
      setAiThinking(true);
      const aiReply = await getAIReply(chatInput.trim(), userLocation);
      setChatMessages(msgs => [...msgs, { user: "DAKA AI", text: aiReply }]);
      setAiThinking(false);
    } else {
      if (!targetUser) {
        alert("请输入对方用户名");
        return;
      }
      // 写入 Firestore
      await addDoc(collection(db, "messages"), {
        from: from,
        to: targetUser,
        text: chatInput.trim(),
        timestamp: Date.now()
      });
      setChatInput("");
    }
  };

  // ===========================
  // ***** AI地图跳转指令监听 *****
  // Listen for AI assistant map jump command [map:xxx]
  // ===========================
  useEffect(() => {
    // 检查AI助手最新消息 / Check last AI assistant message
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.user === "DAKA AI") {
        const match = lastMsg.text.match(/\[map:(.+?)\]/);
        if (match) {
          jumpToAddress(match[1]);
        }
      }
    }
    // eslint-disable-next-line
  }, [chatMessages]);

  // ===========================
  // ***** 跳转到指定地址并显示街景 *****
  // 支持自定义坐标/Google本地前端PlacesService
  // ===========================
  const jumpToAddress = async (address) => {
    // 清除之前的 marker
    if (markersRef.current) {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
    }

    // 优先匹配自定义关键地址（精确坐标，可手动添加）
    const customCoordinates = {
      "雅居乐南湖半岛花园": { lat: 23.21767, lng: 113.33141 }
    };
    if (customCoordinates[address]) {
      const loc = customCoordinates[address];
      if (mapRef.current) {
        mapRef.current.panTo(loc);
        mapRef.current.setZoom(17);
      }
      const marker = new window.google.maps.Marker({
        position: loc,
        map: mapRef.current,
        title: address
      });
      markersRef.current.push(marker);
      setStreetViewLoc(loc);
      return;
    }

    // ========== 用 Google Maps JS PlacesService 搜索地址 ==========
    if (window.google && window.google.maps && window.google.maps.places) {
      const service = new window.google.maps.places.PlacesService(mapRef.current);
      const request = { query: address, fields: ['name', 'geometry'] };
      service.textSearch(request, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
          const loc = results[0].geometry.location;
          const coords = { lat: loc.lat(), lng: loc.lng() };
          mapRef.current.panTo(coords);
          mapRef.current.setZoom(17);
          const marker = new window.google.maps.Marker({
            position: coords,
            map: mapRef.current,
            title: address
          });
          markersRef.current.push(marker);
          setStreetViewLoc(coords);
        } else {
          alert("无法找到该地址或相关地点");
        }
      });
    } else {
      alert("地图服务未加载，请重试或检查网络。");
    }
  };

  // ===========================
  // ***** 地图相关引用 *****
  // Map and marker refs for Google Maps
  // ===========================
  const mapRef = useRef(null); // 地图DOM引用 / Map DOM ref
  const markersRef = useRef([]); // 地图标记ref / Marker refs

  // ===========================
  // ***** 用户唯一ID *****
  // Unique user ID (localStorage)
  // ===========================
  const [userId] = useState(() => {
    let uid = localStorage.getItem("daka_userid");
    if (!uid) {
      uid = "u_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("daka_userid", uid);
    }
    return uid;
  });

  // ===========================
  // ***** 地点数据持久化 *****
  // Persist places to localStorage on update
  // ===========================
  useEffect(() => {
    localStorage.setItem("daka_places", JSON.stringify(places));
  }, [places]);

  // ===========================
  // ***** 地图初始化逻辑 *****
  // Initialize Google Map after entering main page
  // ===========================
  useEffect(() => {
    if (!entered) return;

    const initMap = () => {
      const container = document.getElementById("mapContainer");
      if (!container || !window.google) return;

      // 只初始化一次地图 / Only init once
      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(container, {
          center: { lat: 23.1291, lng: 113.2644 },
          zoom: 13,
        });

        mapRef.current.addListener("click", function (e) {
          setAddModal({ visible: true, lat: e.latLng.lat(), lng: e.latLng.lng() });
        });

        // 获取并显示用户实时位置
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((position) => {
            const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setUserLocation(pos);
            const locationMarker = new window.google.maps.Marker({
              position: pos,
              map: mapRef.current,
              title: "你的位置",
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#4285F4",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#fff",
              },
            });
            mapRef.current.setCenter(pos);
          });
        }
      }
    };

    const existingScript = document.querySelector("script[src*='maps.googleapis.com']");
    if (existingScript) {
      if (window.google && window.google.maps) {
        initMap();
      } else {
        existingScript.onload = initMap;
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyAmi4IfZEGlADtHA-nUbRb2CiS0PjnZk74&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.body.appendChild(script);

    // 清理副作用（离开地图页时）/ Cleanup on leave
    return () => {
      mapRef.current = null;
    };
  }, [entered, setSelectedPlace]);

  // ===========================
  // ***** 渲染地图上的标记 *****
  // Render markers for all places on the map
  // ===========================
  useEffect(() => {
    if (!entered) return;
    // 关键：Google Maps 没加载时不要渲染 marker
    if (!mapRef.current || !window.google || !window.google.maps) return;
    // 清除老 marker / Clear old markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
    // 添加新 marker / Add new markers
    places.forEach((place) => {
      const marker = new window.google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: mapRef.current,
        title: place.name,
      });
      marker.addListener("click", () => setSelectedPlace(place));
      markersRef.current.push(marker);
    });
    // 用户实时位置 marker
    if (userLocation && window.google && window.google.maps) {
      const userMarker = new window.google.maps.Marker({
        position: userLocation,
        map: mapRef.current,
        title: "你的位置",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#fff",
        },
      });
      markersRef.current.push(userMarker);
    }
  }, [places, entered, userLocation]);

  // ===========================
  // ***** 注册逻辑 *****
  // User registration logic
  // ===========================
  const handleRegister = () => {
    if (!regUsername || !regPassword) {
      alert("请输入用户名和密码！");
      return;
    }
    const users = JSON.parse(localStorage.getItem("daka_users") || "[]");
    if (users.find(u => u.username === regUsername)) {
      alert("用户名已存在！");
      return;
    }
    users.push({ username: regUsername, password: regPassword });
    localStorage.setItem("daka_users", JSON.stringify(users));
    alert("注册成功！请登录。");
    setShowRegister(false);
    setRegUsername("");
    setRegPassword("");
  };

  //**** 国际/中国区入口选择页面 ****
  if (!mode) {
    return (
      <div style={{
        background: "#000", color: "#fff", width: "100vw", height: "100vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
      }}>
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
        <h1 style={{ fontSize: 44, marginBottom: 20 }}>Daka 打卡地图</h1>
        <button onClick={() => setMode("global")} style={btnStyle}>
          🌍 国际版（Google地图）
        </button>
        <button onClick={() => setMode("china")} style={btnStyle}>
          🇨🇳 中国区（高德地图）
        </button>
      </div>
    );
  }
  if (mode === "china") {
    return (
      <Appcn setMode={setMode} />
    );
  }
  //**** 启动页（未进入地图前） - 国际版分支 ****
  if (!entered) {
    return (
      <>
        <div
          key={entered}
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Arial, "Liberation Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
            backgroundColor: "#000",
            color: "#fff",
            width: "100vw",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "80px 20px 0 20px",
            boxSizing: "border-box",
            position: "relative"
          }}>
          {/* 返回主页按钮（国际版启动页，绝对定位左上角） */}
          <button
            onClick={() => {
              setMode(null);
              setEntered(false);
            }}
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
          >
            返回主页
          </button>
          <img
            src="/LOGO.png"
            alt="Logo"
            style={{
              width: "140px",
              height: "140px",
              borderRadius: "50%",
              objectFit: "contain",
              marginBottom: "1.5rem",
              border: "2px solid #fff",
              backgroundColor: "#000"
            }}
          />
          <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>Daka</h1>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "2rem", fontWeight: "normal" }}>
            探索未至之境
          </h2>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center", flexDirection: "column", alignItems: "center" }}>
            {!isLoggedIn && !googleUser ? (
              <>
                <input
                  type="text"
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ padding: "10px", marginBottom: "10px", borderRadius: "6px", border: "1px solid #fff", backgroundColor: "#000", color: "#fff" }}
                />
                <input
                  type="password"
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ padding: "10px", marginBottom: "20px", borderRadius: "6px", border: "1px solid #fff", backgroundColor: "#000", color: "#fff" }}
                />
                <button
                  onClick={() => {
                    if (!username || !password) {
                      alert("请输入用户名和密码");
                      return;
                    }
                    const users = JSON.parse(localStorage.getItem("daka_users") || "[]");
                    const user = users.find(u => u.username === username && u.password === password);
                    if (!user) {
                      alert("用户名或密码错误");
                      return;
                    }
                    setIsLoggedIn(true);
                  }}
                  style={{
                    padding: "14px 28px",
                    fontSize: "1rem",
                    border: "1px solid #fff",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                    color: "#fff",
                    cursor: "pointer",
                    minWidth: "160px"
                  }}
                >
                  登录
                </button>
                {/* 注册新账号按钮和弹窗 */}
                <button onClick={() => setShowRegister(true)} style={{ marginTop: 12 }}>注册新账号</button>
                {showRegister && (
                  <div style={{ marginTop: 18, background: "#222", padding: 16, borderRadius: 8 }}>
                    <input
                      type="text"
                      placeholder="用户名"
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      style={{ marginBottom: 8, width: "100%" }}
                    />
                    <input
                      type="password"
                      placeholder="密码"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      style={{ marginBottom: 8, width: "100%" }}
                    />
                    <button onClick={handleRegister} style={{ width: "100%" }}>注册</button>
                    <button onClick={() => setShowRegister(false)} style={{ marginTop: 6, width: "100%" }}>取消</button>
                  </div>
                )}
                <div style={{ marginTop: 20, marginBottom: 36 }}>
                  <GoogleLogin
                    onSuccess={credentialResponse => {
                      const decoded = jwtDecode(credentialResponse.credential);
                      setGoogleUser(decoded);
                      setIsLoggedIn(true);
                    }}
                    onError={() => {
                      console.log("Login Failed");
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Google用户信息展示区（启动页，已登录时，开始探索按钮上方） */}
                {googleUser && (
                  <div style={{
                    display: "flex", alignItems: "center",
                    background: "#111", borderRadius: 10, padding: "8px 14px", marginBottom: 24,
                    maxWidth: 280, marginLeft: "auto", marginRight: "auto"
                  }}>
                    <img src={googleUser.picture} alt="头像" style={{
                      width: 38, height: 38, borderRadius: "50%", marginRight: 12
                    }} />
                    <div>
                      <div style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>{googleUser.name}</div>
                      <div style={{ color: "#aaa", fontSize: 13 }}>{googleUser.email}</div>
                    </div>
                    <button
                      onClick={() => {
                        setGoogleUser(null);
                        setIsLoggedIn(false);
                        setUsername("");
                        setPassword("");
                        setEntered(false);
                      }}
                      style={{
                        marginLeft: 16, background: "#444", color: "#fff",
                        border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer"
                      }}
                    >
                      退出登录
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setEntered(true)}
                  style={{
                    padding: "14px 28px",
                    fontSize: "1rem",
                    border: "1px solid #fff",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                    color: "#fff",
                    cursor: "pointer",
                    minWidth: "160px"
                  }}
                >
                  开始探索
                </button>
              </>
            )}
            {/* 获取 App 按钮已移除 */}
          </div>
        </div>
        {/* 右下角绝对定位的“获取 App”按钮，仅在启动页显示 */}
        <button
          style={{
            position: "fixed",
            right: 40,
            bottom: 40,
            zIndex: 10000,
            padding: "14px 28px",
            fontSize: "1rem",
            border: "1px solid #fff",
            borderRadius: "8px",
            backgroundColor: "#000",
            color: "#fff",
            cursor: "pointer",
            minWidth: "160px"
          }}
        >
          获取 App
        </button>
      </>
    );
  }

  //**** 地图主界面（已进入） ****
  // ===========================
  // ***** 地图主界面渲染 *****
  // Render main map page after entering
  // ===========================
  return (
    <>
      <div
        key={entered}
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Arial, "Liberation Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          backgroundColor: "#000",
          color: "#fff",
          width: "100vw",
          height: "100vh",
          overflow: "auto",
          padding: 20,
          boxSizing: "border-box"
        }}>
      {/* **** 返回主页按钮 **** */}
      <button
        onClick={() => {
          setSelectedPlace(null);
          setEntered(false);
        }}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          padding: "8px 12px",
          backgroundColor: "#000",
          color: "#fff",
          border: "1px solid #fff",
          borderRadius: "6px",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        返回主页
      </button>
      {/* Google用户信息展示区（地图主界面，返回主页按钮下方） */}
      {googleUser && (
        <div style={{
          display: "flex", alignItems: "center",
          background: "#111", borderRadius: 10, padding: "8px 14px", marginBottom: 24,
          maxWidth: 280, marginLeft: "auto", marginRight: "auto"
        }}>
          <img src={googleUser.picture} alt="头像" style={{
            width: 38, height: 38, borderRadius: "50%", marginRight: 12
          }} />
          <div>
            <div style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>{googleUser.name}</div>
            <div style={{ color: "#aaa", fontSize: 13 }}>{googleUser.email}</div>
          </div>
          <button
            onClick={() => {
              setGoogleUser(null);
              setIsLoggedIn(false);
              setUsername("");
              setPassword("");
              setEntered(false);
            }}
            style={{
              marginLeft: 16, background: "#444", color: "#fff",
              border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer"
            }}
          >
            退出登录
          </button>
        </div>
      )}
      <h1 style={{ textAlign: "center", fontSize: "2.5rem", marginBottom: "1rem" }}>Daka</h1>
      <h2 style={{ textAlign: "center", fontWeight: "normal", marginBottom: 30 }}>📍 打卡地图 · 有趣地点分享</h2>
      {entered && (
        <>
          <div
            id="mapContainer"
            style={{ width: "100%", height: "400px", borderRadius: "10px", marginTop: 20 }}
          />
          {/* 显示街景 */}
          {streetViewLoc && (
            <div id="pano" style={{ width: "100%", height: "400px", borderRadius: "10px", marginTop: 10 }} />
          )}
          {/* 显示我的位置按钮 */}
          <button
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                  const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  };
                  setUserLocation(pos);
                  if (mapRef.current) {
                    mapRef.current.setCenter(pos);
                  }
                });
              }
            }}
            style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              padding: "8px 12px",
              backgroundColor: "#7ed957",
              color: "#000",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              zIndex: 1000
            }}
          >
            📍 显示我的位置
          </button>
        </>
      )}
      {selectedPlace && (
        <div style={{ marginTop: 20, border: "1px solid #ccc", borderRadius: "10px", padding: 16, background: "#111" }}>
          <h2>{selectedPlace.name}</h2>
          {/* 上传者信息 */}
          <p style={{ color: "#aaa", marginTop: 6, fontSize: 15 }}>
            上传者：{selectedPlace.uploader?.name || "匿名"}
          </p>
          {selectedPlace.uploader?.picture && (
            <img src={selectedPlace.uploader.picture} alt="头像" style={{ width: 28, height: 28, borderRadius: "50%", marginTop: 4 }} />
          )}
          <img src={selectedPlace.imageUrl} alt={selectedPlace.name} style={{ width: "100%", borderRadius: "8px" }} />
          <p style={{ marginTop: 10 }}>{selectedPlace.description}</p>

          {/* **** 用户评论模块 **** */}
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
            <button onClick={() => {
              setSelectedPlace(null);
              setStreetViewLoc(null); // 关闭详情时隐藏街景
            }} style={{ marginTop: 10, marginLeft: 10 }}>关闭</button>
            {selectedPlace.userId === userId && (
              <button
                onClick={() => {
                  setPlaces(prev => prev.filter(p => p.id !== selectedPlace.id));
                  setSelectedPlace(null);
                  setComments(prev => {
                    const copy = { ...prev };
                    delete copy[selectedPlace.id];
                    return copy;
                  });
                }}
                style={{
                  marginTop: 10,
                  marginLeft: 10,
                  background: "#ff5a5a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 16px",
                  cursor: "pointer"
                }}
              >
                删除该地点
              </button>
            )}
          </div>
        </div>
      )}

      {/* **** 添加地点弹窗逻辑 **** */}
      {addModal.visible && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#222", borderRadius: 10, padding: 28, minWidth: 320, color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.3)"
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
            <textarea
              placeholder="评论（可选）"
              value={newPlaceComment}
              onChange={e => setNewPlaceComment(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8, borderRadius: 4, border: "1px solid #444", background: "#111", color: "#fff" }}
            />
            <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
              <button onClick={() => {
                setAddModal({ visible: false, lat: null, lng: null });
                setNewPlaceName("");
                setNewPlaceDesc("");
                setNewPlaceImage(null);
                setNewPlaceComment("");
              }}
                style={{ padding: "6px 16px", borderRadius: 6, background: "#444", color: "#fff", border: "none", cursor: "pointer" }}
              >取消</button>
              <button
                onClick={() => {
                  if (!newPlaceName || !newPlaceImage) {
                    alert("请填写地点名称并上传图片！");
                    return;
                  }
                  if (addModal.lat === null || addModal.lng === null) {
                    alert("没有获取到地图坐标，请点击地图后再试！");
                    return;
                  }
                  const newId = Date.now();
                  setPlaces(prev => [
                    ...prev,
                    {
                      id: newId,
                      name: newPlaceName,
                      description: newPlaceDesc,
                      lat: addModal.lat,
                      lng: addModal.lng,
                      imageUrl: newPlaceImage,
                      comments: newPlaceComment ? [newPlaceComment] : [],
                      userId, // 记录创建者
                      uploader: googleUser ? {
                        name: googleUser.name,
                        email: googleUser.email,
                        picture: googleUser.picture,
                      } : {
                        name: username || "匿名",
                        email: "",
                        picture: ""
                      }
                    }
                  ]);
                  setComments(prev => ({
                    ...prev,
                    [newId]: newPlaceComment ? [newPlaceComment] : [],
                  }));
                  setAddModal({ visible: false, lat: null, lng: null });
                  setNewPlaceName("");
                  setNewPlaceDesc("");
                  setNewPlaceImage(null);
                  setNewPlaceComment("");
                }}
                style={{ padding: "6px 16px", borderRadius: 6, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* **** 悬浮聊天按钮和弹窗 **** */}
      <div style={{ position: "fixed", bottom: 40, right: 40, zIndex: 9999 }}>
        {!chatOpen && (
          <button
            onClick={() => {
              setChatOpen(true);
              setChatMessages([
                {
                  user: "DAKA AI",
                  text: "Hi，我是 Daka AI，你的本地生活向导和AI朋友！🌟 无论你想打卡哪里、找美食、查攻略，还是纯聊天，都可以找我！快来问我任何关于广州、地图、生活玩乐的问题吧！"
                }
              ]);
            }}
            style={{
              background: "#fff",
              color: "#000",
              borderRadius: "50%",
              width: 56,
              height: 56,
              fontSize: 28,
              border: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              cursor: "pointer"
            }}
          >💬</button>
        )}
        {chatOpen && (
          <div style={{
            width: 320, height: 470, background: "#222", borderRadius: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)", padding: 16, display: "flex", flexDirection: "column"
          }}>
            {/* 全局CSS for dot-flash */}
            <style>
            {`
              .dot-flash {
                display: inline-block;
                width: 1.5em;
                text-align: left;
                letter-spacing: 2px;
                animation: dots 1.2s steps(3, end) infinite;
              }
              @keyframes dots {
                0%, 20% { opacity: 0; }
                40% { opacity: 1; }
                60% { opacity: .6; }
                80%, 100% { opacity: 0.2; }
              }
            `}
            </style>
            <div style={{ marginBottom: 8, fontWeight: "bold", fontSize: 18, color: "#fff" }}>
              {/* 聊天模式切换按钮 */}
              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <button
                  onClick={() => setChatMode("ai")}
                  style={{
                    background: chatMode === "ai" ? "#7ed957" : "#444",
                    color: "#000",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  DAKA AI
                </button>
                <button
                  onClick={() => setChatMode("user")}
                  style={{
                    background: chatMode === "user" ? "#7ed957" : "#444",
                    color: "#000",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  用户私聊
                </button>
              </div>
              Daka 聊天室
              <button
                onClick={() => {
                  setChatOpen(false);
                  setChatMessages([]);
                }}
                style={{ float: "right", background: "none", color: "#fff", border: "none", fontSize: 20, cursor: "pointer" }}
              >×</button>
            </div>
            {/* 私聊目标输入框，仅在用户模式下显示 */}
            {chatMode === "user" && (
              <input
                placeholder="输入对方用户名"
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #444", background: "#000", color: "#fff", marginBottom: 8 }}
              />
            )}
            <div style={{
              flex: 1, overflowY: "auto", background: "#111", borderRadius: 8, padding: 8, marginBottom: 8, color: "#eee"
            }}>
              {chatMode === "ai" ? (
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
                ((privateMessages[username < targetUser ? `${username}_${targetUser}` : `${targetUser}_${username}`] || []).map((msg, i) => (
                  <div key={i} style={{ margin: "8px 0" }}>
                    <span style={{ fontWeight: "bold", color: "#7ed957" }}>{msg.user}</span>
                    <span style={{ marginLeft: 10 }}>{msg.text}</span>
                  </div>
                ))
            ))}
              {chatMode === "ai" && aiThinking && (
                <div style={{ color: "#7ed957", margin: "8px 0", fontWeight: "bold" }}>
                  DAKA AI 正在输入<span className="dot-flash">...</span>
                </div>
              )}
            </div>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="输入消息并回车发送"
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #444", background: "#000", color: "#fff" }}
            />
            {/* 文件上传按钮，紧跟聊天输入框下方，仅AI模式可用 */}
            {chatMode === "ai" && (
              <input
                type="file"
                accept=".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
                      // TXT文本直接读取
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const content = reader.result;
                        setChatMessages(msgs => [...msgs, { user: (googleUser?.name || username || "我"), text: `[文件] ${file.name}` }]);
                        setAiThinking(true);
                        const aiReply = await getAIReply(`以下是用户上传的文件内容，请帮解读、总结或翻译：\n\n${content}`);
                        setChatMessages(msgs => [...msgs, { user: "AI助手", text: aiReply }]);
                        setAiThinking(false);
                      };
                      reader.readAsText(file);
                    } else if (
                      file.type === "application/pdf" || file.name.endsWith(".pdf") ||
                      file.type === "application/msword" || file.name.endsWith(".doc") ||
                      file.name.endsWith(".docx") ||
                      file.type.startsWith("image/")
                    ) {
                      alert("PDF/Word/图片文件需要后端解析，当前前端仅支持txt，后续会升级支持所有文档类型。");
                    } else {
                      alert("暂不支持该类型文件。");
                    }
                  }
                }}
                style={{ marginTop: 8, marginBottom: 8 }}
              />
            )}
            <button
              onClick={sendMessage}
              style={{ marginTop: 8, width: "100%", borderRadius: 6, background: "#7ed957", color: "#000", border: "none", padding: 10, fontWeight: "bold" }}
            >
              发送
            </button>
            <div style={{ color: "#888", fontSize: 12, marginTop: 2, textAlign: "center" }}>
              当前为本地端对端示范，数据不会发送到服务器，刷新后将丢失。
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

export default function WrappedApp() {
  return (
    <GoogleOAuthProvider clientId="732999497375-c9gvdkb9opjhthchd1s9ol6aed2daqh0.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  );
}
