import React, { useEffect, useState } from "react";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  collection,
  onSnapshot
} from "firebase/firestore";

import { auth, db } from "./firebase";

import "./App.css";

function App() {

  const [usuario, setUsuario] = useState(null);

  const [ventas, setVentas] = useState([]);

  const [loading, setLoading] = useState(true);

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