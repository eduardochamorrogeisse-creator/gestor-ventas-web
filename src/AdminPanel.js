import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import "./AdminPanel.css";

const AdminPanel = ({ usuario, datosUsuario, onRegresar }) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [metricas, setMetricas] = useState({
    hoy: 0,
    mes: 0,
    total: 0,
    grafico: []
  });

  useEffect(() => {
    if (!datosUsuario || datosUsuario.rol !== "admin") return;

    const q = query(collection(db, "ventas"), orderBy("lastUpdated", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date();
      const hoyStr = String(now.getDate()).padStart(2, '0') + '/' +
                    String(now.getMonth() + 1).padStart(2, '0') + '/' +
                    now.getFullYear();

      const mesStr = String(now.getMonth() + 1).padStart(2, '0') + '/' +
                     now.getFullYear();

      let sumHoy = 0;
      let sumMes = 0;
      let sumTotal = 0;
      const ventasPorDia = {};

      // Inicializar últimos 7 días para el gráfico
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        const key = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
        ventasPorDia[key] = { label, total: 0 };
      }

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const monto = Number(data.total) || 0;
        const fechaVenta = data.fecha; // Se asume dd/mm/yyyy

        sumTotal += monto;

        if (fechaVenta === hoyStr) {
          sumHoy += monto;
        }

        if (fechaVenta && fechaVenta.includes(mesStr)) {
          sumMes += monto;
        }

        // Para el gráfico de los últimos 7 días
        if (ventasPorDia[fechaVenta]) {
          ventasPorDia[fechaVenta].total += monto;
        }
      });

      setMetricas({
        hoy: sumHoy,
        mes: sumMes,
        total: sumTotal,
        grafico: Object.values(ventasPorDia)
      });
    });

    return () => unsubscribe();
  }, [datosUsuario]);

  // Si por alguna razón llega aquí sin ser admin, bloqueamos
  if (datosUsuario?.rol !== "admin" || datosUsuario?.estado !== "aprobado") {
    return (
      <div className="admin-error">
        <h1>Acceso Denegado</h1>
        <p>No tienes permisos para ver esta sección.</p>
        <button onClick={onRegresar} className="btn-save">Regresar al Inicio</button>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="admin-view">
            <h2>Panel de Control</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Ventas Hoy</h3>
                <p className="stat-amount">${metricas.hoy.toLocaleString("es-CL")}</p>
              </div>
              <div className="stat-card">
                <h3>Ventas del Mes</h3>
                <p className="stat-amount">${metricas.mes.toLocaleString("es-CL")}</p>
              </div>
              <div className="stat-card">
                <h3>Ventas Totales</h3>
                <p className="stat-amount">${metricas.total.toLocaleString("es-CL")}</p>
              </div>
            </div>

            <div className="chart-container card" style={{marginTop: '2rem'}}>
              <h3>Ventas Últimos 7 Días</h3>
              <div className="bar-chart">
                {metricas.grafico.map((dia, idx) => (
                  <div key={idx} className="chart-column">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.min((dia.total / (Math.max(...metricas.grafico.map(d => d.total)) || 1)) * 150, 150)}px`
                      }}
                      title={`$${dia.total.toLocaleString("es-CL")}`}
                    ></div>
                    <span className="chart-label">{dia.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case "usuarios":
        return (
          <div className="admin-view">
            <h2>Gestión de Usuarios</h2>
            <p>Aquí podrás aprobar, rechazar o cambiar roles de usuarios.</p>
            {/* Tabla de usuarios vendrá aquí */}
          </div>
        );
      case "sucursales":
        return (
          <div className="admin-view">
            <h2>Sucursales</h2>
            <p>Configuración de locales y puntos de venta.</p>
          </div>
        );
      case "sistema":
        return (
          <div className="admin-view">
            <h2>Configuración del Sistema</h2>
            <p>Parámetros globales y catálogos de tipos de venta.</p>
          </div>
        );
      default:
        return <div>Selecciona una opción del menú.</div>;
    }
  };

  return (
    <div className="admin-layout">
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <h3>GESTOR ADMIN</h3>
        </div>
        <nav className="sidebar-nav">
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
          <button className={activeTab === "usuarios" ? "active" : ""} onClick={() => setActiveTab("usuarios")}>Usuarios</button>
          <button className={activeTab === "sucursales" ? "active" : ""} onClick={() => setActiveTab("sucursales")}>Sucursales</button>
          <button className={activeTab === "sistema" ? "active" : ""} onClick={() => setActiveTab("sistema")}>Sistema</button>
        </nav>
        <div className="sidebar-footer">
          <button onClick={onRegresar} className="btn-back">Salir del Panel</button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="topbar-left">
            <span>Admin: <strong>{usuario.displayName || usuario.email}</strong></span>
          </div>
          <div className="topbar-right">
             <span className="badge-admin">Modo Administrador</span>
          </div>
        </header>

        <section className="admin-content">
          {renderContent()}
        </section>
      </main>
    </div>
  );
};

export default AdminPanel;
