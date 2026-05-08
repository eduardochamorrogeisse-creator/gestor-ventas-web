import React, { useEffect, useState } from "react";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import { auth, db } from "./firebase";

import "./App.css";

function App() {

  const [usuario, setUsuario] = useState(null);

  const [ventas, setVentas] = useState([]);

  const [loading, setLoading] = useState(true);

  const [sucursales, setSucursales] = useState(["Lebu", "Los Álamos", "Cañete"]);
  const [tiposVenta, setTiposVenta] = useState(["S/B", "Boleta", "Factura", "Transferencia", "Debito/Credito"]);

  const [total, setTotal] = useState("");
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState("Lebu");
  const [tipoSeleccionado, setTipoSeleccionado] = useState("S/B");

  // Detectar sesión
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      setUsuario(user);

      setLoading(false);

    });

    return () => unsubscribe();

  }, []);

  // Cargar ventas
  useEffect(() => {

    if (!usuario) return;

    const unsubscribe = onSnapshot(
      collection(db, "ventas"),
      (snapshot) => {

        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setVentas(docs);

      }
    );

    return () => unsubscribe();

  }, [usuario]);

  // Cargar configuración desde catálogos centralizados
  useEffect(() => {

    if (!usuario) return;

    const cargarCatalogos = async () => {
      try {
        // 1. Cargar Sucursales
        const sucursalesRef = doc(db, "catalogos", "sucursales");
        const sucursalesSnap = await getDoc(sucursalesRef);

        if (sucursalesSnap.exists()) {
          const data = sucursalesSnap.data();
          if (data.items && Array.isArray(data.items)) {
            setSucursales(data.items);
            setSucursalSeleccionada(data.items[0]);
            console.log("Catálogo de sucursales cargado:", data.items);
          }
        } else {
          // Crear catálogo inicial si no existe
          const defaultSucursales = ["Lebu", "Los Álamos", "Cañete"];
          await setDoc(sucursalesRef, { items: defaultSucursales });
          setSucursales(defaultSucursales);
          setSucursalSeleccionada(defaultSucursales[0]);
          console.log("Catálogo de sucursales creado con valores iniciales.");
        }

        // 2. Cargar Tipos de Venta
        const tiposRef = doc(db, "catalogos", "tipos_venta");
        const tiposSnap = await getDoc(tiposRef);

        if (tiposSnap.exists()) {
          const data = tiposSnap.data();
          if (data.items && Array.isArray(data.items)) {
            setTiposVenta(data.items);
            setTipoSeleccionado(data.items[0]);
            console.log("Catálogo de tipos de venta cargado:", data.items);
          }
        } else {
          // Crear catálogo inicial si no existe
          const defaultTipos = ["S/B", "Boleta", "Factura", "Transferencia", "Debito/Credito"];
          await setDoc(tiposRef, { items: defaultTipos });
          setTiposVenta(defaultTipos);
          setTipoSeleccionado(defaultTipos[0]);
          console.log("Catálogo de tipos de venta creado con valores iniciales.");
        }

      } catch (error) {
        console.error("Error al gestionar catálogos:", error);
      }
    };

    cargarCatalogos();

  }, [usuario]);

  // Login con Google
  const iniciarSesion = async () => {

    try {

      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);

    } catch (error) {

      console.log(error);

      alert("Error al iniciar sesión con Google");

    }

  };

  // Logout
  const cerrarSesion = async () => {

    await signOut(auth);

  };

  // Guardar venta
  const guardarVenta = async (e) => {
    e.preventDefault();

    if (!total || isNaN(total)) {
      alert("Por favor ingrese un total válido");
      return;
    }

    // Normalización exacta para compatibilidad con Android
    const sucursalNormalizada = sucursalSeleccionada.trim();
    const tipoNormalizado = tipoSeleccionado.trim();

    // Formato manual dd/MM/yyyy para asegurar barras '/' requeridas por Android
    const hoy = new Date();
    const fechaFormateada =
      String(hoy.getDate()).padStart(2, '0') + '/' +
      String(hoy.getMonth() + 1).padStart(2, '0') + '/' +
      hoy.getFullYear();

    try {
      await addDoc(collection(db, "ventas"), {
        fecha: fechaFormateada,
        lastUpdated: Date.now(),
        sucursal: sucursalNormalizada,
        tipo: tipoNormalizado,
        total: Number(total),
        usuario: usuario.displayName || usuario.email,
        usuarioId: usuario.uid
      });

      setTotal("");
      alert("Venta registrada");
    } catch (error) {
      console.error("Error al guardar venta:", error);
      alert("Error al registrar la venta");
    }
  };

  // Loading
  if (loading) {

    return (
      <div className="App">
        <h1>Cargando...</h1>
      </div>
    );

  }

  // Pantalla login
  if (!usuario) {

    return (

      <div className="App">

        <div style={{ marginTop: 100 }}>

          <h1>Gestor de Ventas</h1>

          <button
            onClick={iniciarSesion}
            style={{
              padding: 15,
              width: 250,
              cursor: "pointer",
              fontSize: 16
            }}
          >
            Iniciar con Google
          </button>

        </div>

      </div>

    );

  }

  // App logueada
  return (

    <div className="App">

      <header className="App-header">

        <h1>Gestor de Ventas</h1>

        <p>
          Bienvenido:
          {" "}
          {usuario.email}
        </p>

        <button
          onClick={cerrarSesion}
          style={{
            padding: 10,
            cursor: "pointer"
          }}
        >
          Cerrar Sesión
        </button>

      </header>

      <main style={{ padding: 20 }}>

        <section style={{
          marginBottom: 40,
          padding: 20,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fff",
          color: "#333",
          maxWidth: 400
        }}>
          <h3>Registrar Nueva Venta</h3>
          <form onSubmit={guardarVenta} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            <label>Total:</label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Ej: 5000"
              style={{ padding: 8 }}
              required
            />

            <label>Sucursal:</label>
            <select
              value={sucursalSeleccionada}
              onChange={(e) => setSucursalSeleccionada(e.target.value)}
              style={{ padding: 8 }}
            >
              {sucursales.map((s, index) => (
                <option key={index} value={s}>{s}</option>
              ))}
            </select>

            <label>Tipo de Venta:</label>
            <select
              value={tipoSeleccionado}
              onChange={(e) => setTipoSeleccionado(e.target.value)}
              style={{ padding: 8 }}
            >
              {tiposVenta.map((t, index) => (
                <option key={index} value={t}>{t}</option>
              ))}
            </select>

            <button
              type="submit"
              style={{
                marginTop: 10,
                padding: 10,
                cursor: "pointer",
                background: "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4
              }}
            >
              Guardar Venta
            </button>
          </form>
        </section>

        <h2>Ventas</h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >

          {
            ventas.map((venta) => (

              <div
                key={venta.id}
                style={{
                  border: "1px solid #ccc",
                  padding: 10,
                  borderRadius: 8,
                  textAlign: "left",
                  background: "#f9f9f9",
                  color: "#333"
                }}
              >

                <p>
                  <strong>Usuario:</strong>
                  {" "}
                  {venta.usuario}
                </p>

                <p>
                  <strong>Total:</strong>
                  {" "}
                  ${venta.total}
                </p>

                <p>
                  <strong>Sucursal:</strong>
                  {" "}
                  {venta.sucursal}
                </p>

                <p>
                  <strong>Fecha:</strong>
                  {" "}
                  {venta.fecha?.seconds
                    ? new Date(
                        venta.fecha.seconds * 1000
                      ).toLocaleDateString()
                    : venta.fecha}
                </p>

              </div>

            ))
          }

        </div>

      </main>

    </div>

  );

}

export default App;