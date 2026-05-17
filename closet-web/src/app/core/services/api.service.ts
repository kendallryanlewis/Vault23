import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Thin HTTP wrapper for the Vault23 sneaker API.
 * All methods return typed Observables — add response interfaces as the API is explored.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly base = environment.apiUrl;

    constructor(private http: HttpClient) { }

    get<T>(path: string): Observable<T> {
        return this.http.get<T>(`${this.base}${path}`);
    }

    post<T>(path: string, body: unknown): Observable<T> {
        return this.http.post<T>(`${this.base}${path}`, body);
    }

    put<T>(path: string, body: unknown): Observable<T> {
        return this.http.put<T>(`${this.base}${path}`, body);
    }

    delete<T>(path: string): Observable<T> {
        return this.http.delete<T>(`${this.base}${path}`);
    }
}
