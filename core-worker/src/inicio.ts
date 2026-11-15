import NúcleoInicio from './nucleo/inicio'; // Importa el Worker real que ya existe en el núcleo. Ese archivo tiene el export default con fetch(), email() y scheduled(). Si el proyecto procesa correos, debajo de esta línea se agrega import './[nombre]/correos', que carga el módulo de negocio de correos. Ese import no trae valores directamente, solo ejecuta el archivo. Dentro de ese archivo se llama EstablecerProcesadorCorreo().


export default NúcleoInicio; // Exporta hacia Cloudflare el mismo Worker del núcleo. Cloudflare usa este objeto para llamar fetch(), email() o scheduled().
