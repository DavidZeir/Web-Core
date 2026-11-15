import { type Contexto } from '../global';
import { ResponderSalud } from '../api';


export async function Salud(contexto: Contexto): Promise<Response> {
	return ResponderSalud(contexto);
}
