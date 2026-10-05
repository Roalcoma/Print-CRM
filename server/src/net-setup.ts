// El contenedor no tiene salida IPv6, pero Instagram, Google y Meta resuelven también a IPv6. Con la
// selección automática de familia de Node, si la conexión IPv4 tarda más de 250 ms (picos de latencia
// del internet de casa) se abandona, se prueba la IPv6, falla al instante y fetch da "fetch failed"
// (AggregateError). Se fuerza IPv4 primero y sin la carrera entre familias.
import net from 'node:net';
import dns from 'node:dns';

net.setDefaultAutoSelectFamily(false);
dns.setDefaultResultOrder('ipv4first');
