package com.technomile.erpconfigapi.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "target", uniqueConstraints = {
        @UniqueConstraint(name = "uq_target_client_name", columnNames = {"client_id", "target_name"})
})
public class Target {
    @Id
    @Column(name = "target_id", length = 150)
    private String targetId;

    @Column(name = "client_id", nullable = false, length = 50)
    private String clientId;

    @Column(name = "target_name", nullable = false, length = 100)
    private String targetName;

    @Column(name = "base_url", nullable = false, length = 500)
    private String baseUrl;

    @Column(name = "auth_type", nullable = false, length = 20)
    private String authType;

    @Column(name = "credential_ref", nullable = false, length = 200)
    private String credentialRef;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_headers", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> defaultHeaders;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "updated_at", nullable = false)
    @UpdateTimestamp
    private OffsetDateTime updatedAt;

    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getTargetName() { return targetName; }
    public void setTargetName(String targetName) { this.targetName = targetName; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getAuthType() { return authType; }
    public void setAuthType(String authType) { this.authType = authType; }
    public String getCredentialRef() { return credentialRef; }
    public void setCredentialRef(String credentialRef) { this.credentialRef = credentialRef; }
    public Map<String, Object> getDefaultHeaders() { return defaultHeaders; }
    public void setDefaultHeaders(Map<String, Object> defaultHeaders) { this.defaultHeaders = defaultHeaders; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
