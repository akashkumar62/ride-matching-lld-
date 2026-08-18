package com.ridematching.matching.client;

import com.ridematching.common.response.ApiResponse;
import com.ridematching.matching.dto.NearbyDriverResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;

@Component
@RequiredArgsConstructor
public class LocationServiceClient {

    private final RestClient locationServiceRestClient;
    private final ServiceAccountAuthClient authClient;

    public List<NearbyDriverResponse> findNearby(double latitude, double longitude,
                                                  double radiusKm, int limit) {
        try {
            return doFindNearby(latitude, longitude, radiusKm, limit, authClient.getToken());
        } catch (RestClientResponseException e) {
            if (isUnauthorized(e)) {
                authClient.refreshToken();
                return doFindNearby(latitude, longitude, radiusKm, limit, authClient.getToken());
            }
            throw e;
        }
    }

    private List<NearbyDriverResponse> doFindNearby(double latitude, double longitude,
                                                     double radiusKm, int limit, String token) {

        ApiResponse<List<NearbyDriverResponse>> response = locationServiceRestClient.get()
                .uri(uriBuilder -> uriBuilder.path("/locations/nearby")
                        .queryParam("latitude", latitude)
                        .queryParam("longitude", longitude)
                        .queryParam("radiusKm", radiusKm)
                        .queryParam("limit", limit)
                        .build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });

        return response == null || response.getData() == null
                ? List.of()
                : response.getData();
    }

    private boolean isUnauthorized(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        return status == 401 || status == 403;
    }

}
