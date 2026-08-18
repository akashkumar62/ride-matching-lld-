package com.ridematching.matching.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Bean
    RestClient authServiceRestClient(@Value("${auth.service.url}") String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }

    @Bean
    RestClient locationServiceRestClient(@Value("${location.service.url}") String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }

    @Bean
    RestClient rideServiceRestClient(@Value("${ride.service.url}") String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }

    @Bean
    RestClient driverServiceRestClient(@Value("${driver.service.url}") String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }

}
