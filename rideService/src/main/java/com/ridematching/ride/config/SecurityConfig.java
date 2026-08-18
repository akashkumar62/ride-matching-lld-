package com.ridematching.ride.config;

import com.ridematching.ride.security.JwtFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {

        http
                .csrf(csrf -> csrf.disable())

                .cors(Customizer.withDefaults())

                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth

                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        .requestMatchers(HttpMethod.POST, "/rides").hasRole("RIDER")
                        .requestMatchers(HttpMethod.GET, "/rides/mine").hasRole("RIDER")
                        .requestMatchers(HttpMethod.PUT, "/rides/*/cancel").hasRole("RIDER")

                        .requestMatchers(HttpMethod.GET, "/rides/unmatched").hasRole("ADMIN")

                        .requestMatchers(HttpMethod.PUT, "/rides/*/accept").hasRole("DRIVER")
                        .requestMatchers(HttpMethod.PUT, "/rides/*/driver-cancel").hasRole("DRIVER")
                        .requestMatchers(HttpMethod.PUT, "/rides/*/arrive").hasRole("DRIVER")
                        .requestMatchers(HttpMethod.PUT, "/rides/*/start").hasRole("DRIVER")
                        .requestMatchers(HttpMethod.PUT, "/rides/*/complete").hasRole("DRIVER")

                        .anyRequest().authenticated())

                .addFilterBefore(jwtFilter,
                        UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of(
                "http://localhost:5173",
                "http://192.168.*.*:5173",
                "http://10.*.*.*:5173"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        return source;
    }

}
